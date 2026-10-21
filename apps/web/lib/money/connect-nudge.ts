import { createMailer, type MailerOptions } from "@akana/emails";
import { connectStepLeft, isoWeekKey } from "@/lib/money/studio-payments";

/**
 * The weekly Connect nudge (build list 14.29). A title may go live before
 * Stripe Connect onboarding is complete; the earnings accrue and the payout
 * run skips the organisation as 'unverified' (0021). While money waits, the
 * organisation's owners and finance contacts get one email a week naming
 * the one step left, through the ordinary mailer and its guards.
 *
 * Once a week: each send claims connectNudgeKey() in public.email_claims
 * (0010), keyed on the organisation, the ISO week and the recipient, so a
 * second run in the same week sends nothing new and a failed send can go
 * again on the next day's run.
 *
 * Over small interfaces so it runs with fakes in tests. Logs and results
 * carry counts only: never an address, an amount or a title.
 */

export interface NudgeCandidate {
  org_id: string;
  display_name: string;
  connect_status: string;
  currency: string;
  balance_minor: number | string;
}

export interface NudgeContact {
  user_id: string;
  email: string;
}

export interface NudgeStore {
  candidates(livemode: boolean): Promise<NudgeCandidate[]>;
  contacts(orgId: string): Promise<NudgeContact[]>;
  claim: NonNullable<MailerOptions["claim"]>;
  release: NonNullable<MailerOptions["release"]>;
}

export interface NudgeDeps {
  env: MailerOptions["env"];
  log: MailerOptions["log"];
  transport?: MailerOptions["transport"];
  origin: string;
  now?: () => Date;
}

export interface NudgeOutcome {
  organisations: number;
  sent: number;
  skipped: number;
  failed: number;
}

export function connectNudgeKey(orgId: string, userId: string, at: Date): string {
  return `connect_nudge:${orgId}:${isoWeekKey(at)}:${userId}`;
}

/** "£50.45" or "£50.45 and $12.00": every currency with money waiting. */
export function waitingWords(rows: { currency: string; balance_minor: number | string }[]): string {
  const parts = rows
    .map((r) => ({ currency: r.currency, n: Number(r.balance_minor) || 0 }))
    .filter((r) => r.n > 0)
    .map((r) => {
      try {
        return new Intl.NumberFormat("en-GB", { style: "currency", currency: r.currency }).format(r.n / 100);
      } catch {
        return `${(r.n / 100).toFixed(2)} ${r.currency}`;
      }
    });
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** Group the candidate rows (one per organisation and currency) by organisation. */
export function groupCandidates(rows: NudgeCandidate[]): Map<string, { name: string; status: string; balances: { currency: string; balance_minor: number }[] }> {
  const out = new Map<string, { name: string; status: string; balances: { currency: string; balance_minor: number }[] }>();
  for (const r of rows) {
    const g = out.get(r.org_id) ?? { name: r.display_name, status: r.connect_status, balances: [] };
    g.balances.push({ currency: r.currency, balance_minor: Number(r.balance_minor) || 0 });
    out.set(r.org_id, g);
  }
  return out;
}

/** Send the week's nudges. Never throws on one organisation's failure. */
export async function sendConnectNudges(store: NudgeStore, deps: NudgeDeps, livemode: boolean): Promise<NudgeOutcome> {
  const outcome: NudgeOutcome = { organisations: 0, sent: 0, skipped: 0, failed: 0 };
  const now = deps.now?.() ?? new Date();
  const mailer = createMailer({
    env: deps.env,
    isSuppressed: () => false,
    log: deps.log,
    claim: store.claim,
    release: store.release,
    ...(deps.transport ? { transport: deps.transport } : {}),
  });
  const payoutsUrl = `${deps.origin}/payouts`;
  const groups = groupCandidates(await store.candidates(livemode));
  for (const [orgId, g] of groups) {
    const step = connectStepLeft(g.status);
    if (!step) continue;
    outcome.organisations++;
    let contacts: NudgeContact[];
    try {
      contacts = await store.contacts(orgId);
    } catch {
      outcome.failed++;
      continue;
    }
    for (const c of contacts) {
      try {
        const r = await mailer.sendAuthor(
          "connect_onboarding_nudge",
          { studioUrl: payoutsUrl, supportEmail: deps.env.EMAIL_REPLY_TO ?? "", organisationName: g.name, step, waiting: waitingWords(g.balances), payoutsUrl },
          { to: c.email, userId: c.user_id, dedupeKey: connectNudgeKey(orgId, c.user_id, now) },
        );
        if (r.status === "sent" || r.status === "sent_test") outcome.sent++;
        else if (r.status === "failed") outcome.failed++;
        else outcome.skipped++;
      } catch {
        outcome.failed++;
      }
    }
  }
  return outcome;
}
