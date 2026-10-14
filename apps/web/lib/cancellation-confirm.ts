import type { SendResult } from "@akana/emails";

/**
 * The 24-hour duty for the cancellation confirmation (R9, CMA207 7.9; see
 * docs/legal/DMCC_PASS.md).
 *
 * The Stripe webhook sends the confirmation when it sees a cancel. If that
 * send fails, two things happen:
 *
 *  1. An ops alert opens at once, through reportOps (migration 0016, the
 *     same path as every other failure). The kind is webhook_failure, which
 *     alerts on the first failure, not email_failure, which waits for five.
 *  2. The next daily run (/api/membership/cancel-emails) tries again for
 *     every membership set to end in the last few days. The mailer claims a
 *     dedupe key before it sends and releases it on failure, so a
 *     confirmation that already went out is never sent twice.
 *
 * Only the period-end confirmation is retried. A cooling-off cancel ends
 * the membership at once and its email states the refund, which a retry
 * cannot rebuild, so that one is left to the alert and the staff resend on
 * the account lookup (0027).
 */

/** How many days back the daily run looks for a membership set to end. */
export const CANCEL_EMAIL_RETRY_DAYS = 3;

export const CANCEL_EMAIL_FAILED = "cancel_email_failed";

/** True when a send result or a thrown error means the reader was not told. */
export function confirmationNotSent(result: Pick<SendResult, "status"> | null | undefined): boolean {
  return !result || result.status === "failed";
}

export interface CancelCandidate {
  subscriptionId: string;
  userId: string;
  /** ISO timestamp access ends: cancel_at, else the period end. */
  endsAt: string | null;
}

export type RetryOutcome = "sent" | "already_sent" | "no_address" | "failed";

export interface RetryDeps {
  now: Date;
  candidates(since: Date): Promise<CancelCandidate[]>;
  send(c: CancelCandidate): Promise<RetryOutcome>;
  /** Opens or adds to an ops alert. Never throws. */
  alert(code: string): Promise<void>;
}

export interface RetryResult {
  checked: number;
  sent: number;
  already_sent: number;
  no_address: number;
  failed: number;
}

/** Map the mailer's status onto what the run counts. */
export function outcomeOf(status: SendResult["status"]): RetryOutcome {
  if (status === "sent" || status === "sent_test") return "sent";
  if (status === "skipped") return "already_sent";
  return "failed";
}

export async function retryCancellationEmails(d: RetryDeps): Promise<RetryResult> {
  const since = new Date(d.now.getTime() - CANCEL_EMAIL_RETRY_DAYS * 86_400_000);
  const list = await d.candidates(since);
  const out: RetryResult = { checked: list.length, sent: 0, already_sent: 0, no_address: 0, failed: 0 };
  for (const c of list) {
    let outcome: RetryOutcome;
    try {
      outcome = await d.send(c);
    } catch {
      outcome = "failed";
    }
    out[outcome] += 1;
  }
  if (out.failed > 0) await d.alert(CANCEL_EMAIL_FAILED);
  return out;
}
