import { createMailer, type MailerOptions, type ReaderProps, type SendResult } from "@akana/emails";
import type { FirstWeekPlan } from "@/lib/first-week-plan";
import { TRIAL_REMINDER_LEAD_DAYS, addDaysUtc, daysWords } from "@/lib/membership-trial";
import { dateWords, moneyWords, readerBase } from "@/lib/support-actions";
import type { MembershipConfirmedNotice, ReaderMailNotice } from "@/lib/stripe-webhook";

/**
 * Sends the confirmation emails the Stripe webhook asks for in outcome.mail
 * (0031 mail gaps): purchase_lifetime for a paid single purchase,
 * purchase_membership for the first paid membership invoice and
 * refund_confirmed for a refund of a single purchase, including one made in
 * the Stripe dashboard. No template takes a title.
 *
 * Each notice carries a dedupe key. The mailer claims it in
 * public.email_claims (0010) before it sends and releases it if the send
 * fails. refund:<re_ id> is the key the refund console claims too
 * (lib/support-mail.ts), so a refund made there and the webhook that follows
 * send one email between them.
 *
 * A membership that starts with a trial gets the day-zero email instead of
 * the confirmation (14.20): trial_started, led by the first week's plan as
 * unit names and followed by the trial dates. The caller supplies the plan
 * and the renewal price (the first invoice is for nothing). Without a plan
 * the email still goes, with the dates alone.
 *
 * The props are built by the same helpers as the staff resend (lib/support-actions.ts),
 * so the webhook email and a resent one read the same.
 */

export interface PurchaseEmailDeps {
  env: MailerOptions["env"];
  claim: NonNullable<MailerOptions["claim"]>;
  release: NonNullable<MailerOptions["release"]>;
  log: MailerOptions["log"];
  transport?: MailerOptions["transport"];
}

export type PurchaseEmailStatus = SendResult["status"] | "no_figures";

/** What the day-zero email needs beyond the notice: the plan and the price the trial renews at. */
export interface TrialExtras {
  firstWeek?: FirstWeekPlan | null;
  /** The price after the trial, in minor units, in the notice's currency. */
  renewalMinor?: number | null;
  /** The day the trial started, for the reminder date. Defaults to now. */
  startedAt?: Date;
}

/** The trial's length in days from its start and end, whole days, at least 1. */
export function trialLengthDays(startedAt: Date, trialEndsAt: Date): number {
  return Math.max(1, Math.round((trialEndsAt.getTime() - startedAt.getTime()) / 86_400_000));
}

/** The props for trial_started, or null when a figure it needs will not format. */
export function trialStartedProps(n: MembershipConfirmedNotice, origin: string, supportEmail: string, extras: TrialExtras = {}): ReaderProps["trial_started"] | null {
  const price = moneyWords(extras.renewalMinor ?? null, n.currency);
  const firstPayment = dateWords(n.nextPaymentAt);
  if (!price || !firstPayment) return null;
  const endsAt = new Date(n.nextPaymentAt);
  const startedAt = extras.startedAt ?? new Date();
  const lead = addDaysUtc(endsAt, -TRIAL_REMINDER_LEAD_DAYS);
  const reminder = dateWords((lead.getTime() < startedAt.getTime() ? startedAt : lead).toISOString());
  if (!reminder) return null;
  const plan = extras.firstWeek;
  return {
    ...readerBase(origin, supportEmail, n.name),
    trialLength: daysWords(trialLengthDays(startedAt, endsAt)),
    reminderDate: reminder,
    firstPaymentDate: firstPayment,
    price,
    periodWords: n.plan === "member_year" ? "a year" : "a month",
    ...(plan ? { planHeading: plan.heading, planItems: plan.items } : {}),
  };
}

/** The props for one notice, or null when a figure it needs will not format. */
export function purchaseEmailProps(
  n: ReaderMailNotice,
  origin: string,
  supportEmail: string,
):
  | { template: "purchase_lifetime"; props: ReaderProps["purchase_lifetime"] }
  | { template: "purchase_membership"; props: ReaderProps["purchase_membership"] }
  | { template: "refund_confirmed"; props: ReaderProps["refund_confirmed"] }
  | null {
  const base = readerBase(origin, supportEmail, n.name);
  const price = moneyWords(n.amountMinor, n.currency);
  if (!price) return null;
  if (n.template === "purchase_lifetime") return { template: n.template, props: { ...base, offerName: "a single workbook", price } };
  if (n.template === "refund_confirmed") return { template: n.template, props: { ...base, amount: price, accessEnded: n.accessEnded } };
  const nextDate = dateWords(n.nextPaymentAt);
  if (!nextDate) return null;
  return { template: n.template, props: { ...base, price, periodWords: n.plan === "member_year" ? "a year" : "a month", nextDate } };
}

export async function sendPurchaseEmail(n: ReaderMailNotice, origin: string, deps: PurchaseEmailDeps, extras: TrialExtras = {}): Promise<PurchaseEmailStatus> {
  if (n.template === "purchase_membership" && n.trial) {
    const props = trialStartedProps(n, origin, deps.env.EMAIL_REPLY_TO ?? "", extras);
    if (!props) return "no_figures";
    const r = await mailerFor(deps).sendReader("trial_started", props, { to: n.to, dedupeKey: n.dedupeKey, ...(n.userId ? { userId: n.userId } : {}) });
    return r.status;
  }
  const made = purchaseEmailProps(n, origin, deps.env.EMAIL_REPLY_TO ?? "");
  if (!made) return "no_figures";
  const mailer = mailerFor(deps);
  const opts = { to: n.to, dedupeKey: n.dedupeKey, ...(n.userId ? { userId: n.userId } : {}) };
  const r =
    made.template === "purchase_lifetime"
      ? await mailer.sendReader("purchase_lifetime", made.props, opts)
      : made.template === "purchase_membership"
        ? await mailer.sendReader("purchase_membership", made.props, opts)
        : await mailer.sendReader("refund_confirmed", made.props, opts);
  return r.status;
}

function mailerFor(deps: PurchaseEmailDeps) {
  return createMailer({
    env: deps.env,
    isSuppressed: () => false,
    log: deps.log,
    claim: deps.claim,
    release: deps.release,
    ...(deps.transport ? { transport: deps.transport } : {}),
  });
}
