import type { SendStatus } from "@akana/emails";

/**
 * The six-monthly terms reminder for monthly members (UK DMCC Act
 * subscription regime, expected January 2027). A contract that renews more
 * often than every six months needs a reminder notice once in every
 * six-month period, sent before a renewal payment. Annual members get
 * renewal_notice from the webhook instead (lib/stripe-webhook.ts).
 *
 * The rule, the same here and in app.due_terms_reminders() (migration 0011):
 *   * monthly plan, active or trialing, nothing set to end it;
 *   * the last terms reminder, or the start of the membership when there has
 *     been none, was six months ago or more;
 *   * the next renewal is between 3 and 14 days away.
 * SQL picks the rows; termsReminderDue() is the pure statement of the rule,
 * and the job checks the timing part again before it sends.
 *
 * Twice-never: each send claims termsReminderDedupeKey() in
 * public.email_claims, then the subscription is stamped with
 * app.mark_terms_reminder_sent(). A claim that is already taken means the
 * email went on an earlier run whose stamp failed, so the job stamps it now
 * and sends nothing.
 *
 * Logs and results carry counts only. Never an address, an id or a title.
 */

export const TERMS_REMINDER_EVERY_MONTHS = 6;
export const TERMS_REMINDER_LEAD_MIN_DAYS = 3;
export const TERMS_REMINDER_LEAD_MAX_DAYS = 14;
const DAY_MS = 86_400_000;

/** A subscription as the rule sees it. Dates are ISO strings. */
export interface TermsReminderCandidate {
  plan: string | null;
  status: string;
  cancelAtPeriodEnd: boolean;
  cancelAt: string | null;
  endedAt: string | null;
  currentPeriodEnd: string | null;
  /** When the membership started (the subscription row's created_at). */
  startedAt: string;
  lastTermsReminderAt: string | null;
}

/**
 * Add calendar months in UTC, holding the day where it exists and otherwise
 * using the month's last day (31 August plus six months is 28 or 29
 * February), the same as Postgres interval arithmetic.
 */
export function addMonthsUtc(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const out = new Date(date.getTime());
  out.setUTCFullYear(y, m, Math.min(date.getUTCDate(), lastDay));
  return out;
}

/** The timing part of the rule: six months since the anchor, and a renewal 3 to 14 days away. */
export function withinTermsReminderWindow(anchor: Date, nextPayment: Date, now: Date): boolean {
  if (addMonthsUtc(anchor, TERMS_REMINDER_EVERY_MONTHS).getTime() > now.getTime()) return false;
  const lead = nextPayment.getTime() - now.getTime();
  return lead >= TERMS_REMINDER_LEAD_MIN_DAYS * DAY_MS && lead <= TERMS_REMINDER_LEAD_MAX_DAYS * DAY_MS;
}

/** The whole rule, as a pure function. */
export function termsReminderDue(c: TermsReminderCandidate, now: Date): boolean {
  if (c.plan !== "member_month" && c.plan !== "member_two_month") return false;
  if (c.status !== "active" && c.status !== "trialing") return false;
  if (c.cancelAtPeriodEnd || c.cancelAt || c.endedAt) return false;
  if (!c.currentPeriodEnd) return false;
  return withinTermsReminderWindow(new Date(c.lastTermsReminderAt ?? c.startedAt), new Date(c.currentPeriodEnd), now);
}

/** One reminder per subscription and next payment date: membership_terms_reminder:<sub id>:<yyyy-mm-dd>. */
export function termsReminderDedupeKey(subscriptionId: string, nextPaymentIso: string): string {
  return `membership_terms_reminder:${subscriptionId}:${nextPaymentIso.slice(0, 10)}`;
}

/** A row from public.due_terms_reminders(). */
export interface DueTermsReminder {
  subscriptionId: string;
  email: string;
  currentPeriodEnd: string;
  reminderAnchorAt: string;
  amountMinor: number | null;
  currency: string | null;
}

/** What the job sends: everything the template needs, never a title. */
export interface TermsReminder {
  to: string;
  subscriptionId: string;
  nextPaymentAt: string;
  amountMinor: number;
  currency: string;
  dedupeKey: string;
}

export interface TermsReminderDeps {
  now: Date;
  /** public.due_terms_reminders(now). Throws on a database error. */
  due(now: Date): Promise<DueTermsReminder[]>;
  /** Send through the mailer, which claims the dedupe key first. */
  send(reminder: TermsReminder): Promise<{ status: SendStatus; reason?: string }>;
  /** public.mark_terms_reminder_sent. Throws on a database error. */
  markSent(subscriptionId: string, at: Date): Promise<void>;
  log?(code: string, detail?: string): void;
}

export interface TermsReminderRun {
  due: number;
  sent: number;
  already_sent: number;
  no_price: number;
  not_due: number;
  failed: number;
  stamp_failed: number;
}

/**
 * Send every due reminder. One failure never stops the others: a failed send
 * is retried on the next run (the mailer released the claim), and a failed
 * stamp is put right on the next run (the claim stops a second email).
 */
export async function runTermsReminders(deps: TermsReminderDeps): Promise<TermsReminderRun> {
  const run: TermsReminderRun = { due: 0, sent: 0, already_sent: 0, no_price: 0, not_due: 0, failed: 0, stamp_failed: 0 };
  const rows = await deps.due(deps.now);
  run.due = rows.length;

  for (const row of rows) {
    if (!withinTermsReminderWindow(new Date(row.reminderAnchorAt), new Date(row.currentPeriodEnd), deps.now)) {
      run.not_due += 1;
      continue;
    }
    // The email must state the price. With no paid invoice on record yet,
    // leave it for a later run inside the window rather than guess.
    if (row.amountMinor === null || !row.currency) {
      run.no_price += 1;
      continue;
    }

    let status: SendStatus;
    let reason: string | undefined;
    try {
      const r = await deps.send({
        to: row.email,
        subscriptionId: row.subscriptionId,
        nextPaymentAt: row.currentPeriodEnd,
        amountMinor: row.amountMinor,
        currency: row.currency,
        dedupeKey: termsReminderDedupeKey(row.subscriptionId, row.currentPeriodEnd),
      });
      status = r.status;
      reason = r.reason;
    } catch {
      status = "failed";
    }

    const went = status === "sent" || status === "sent_test";
    const earlier = status === "skipped" && reason === "already_sent";
    if (!went && !earlier) {
      run.failed += 1;
      deps.log?.("terms_reminder_send_failed", status);
      continue;
    }
    if (went) run.sent += 1;
    else run.already_sent += 1;

    try {
      await deps.markSent(row.subscriptionId, deps.now);
    } catch {
      run.stamp_failed += 1;
      deps.log?.("terms_reminder_stamp_failed");
    }
  }
  return run;
}
