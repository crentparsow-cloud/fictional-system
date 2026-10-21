import { createMailer, type MailerOptions, type ReaderProps, type SendResult } from "@akana/emails";
import { ukDateWords } from "@/lib/membership-trial";
import type { TermsReminder } from "@/lib/membership-reminders";
import type { MembershipNotice } from "@/lib/stripe-webhook";

/**
 * Sends the membership emails the webhook asks for (F-097): payment_failed,
 * the annual renewal_notice, the trial_reminder three days before a trial
 * converts (13.5) and the cancellation confirmation; and the
 * six-monthly membership_terms_reminder the daily job sends to monthly
 * members (lib/membership-reminders.ts). No template takes a title (F-098).
 *
 * Each notice carries a dedupe key. The mailer claims it before it sends and
 * releases it if the send fails, so a repeated Stripe delivery sends nothing
 * new and a failed send can go on the next delivery. The route backs claim
 * and release with public.email_claims (migration 0010); tests use a set.
 *
 * Best effort: a failure is logged by the caller and never turns into a
 * webhook retry.
 */

export interface MembershipEmailDeps {
  env: MailerOptions["env"];
  claim: NonNullable<MailerOptions["claim"]>;
  release: NonNullable<MailerOptions["release"]>;
  log: MailerOptions["log"];
  transport?: MailerOptions["transport"];
}

/** The You page section that holds the Manage membership button. */
export function membershipSettingsUrl(origin: string): string {
  return `${origin}/you#membership`;
}

/** "£69.99" from minor units, or undefined when the currency is unknown. */
export function formatMinor(minor: number, currency: string): string | undefined {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(minor / 100);
  } catch {
    return undefined;
  }
}

/** "6 October 2027", in UTC so the date matches the dedupe key. */
export function renewalDateWords(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

function mailerFor(deps: MembershipEmailDeps) {
  return createMailer({
    env: deps.env,
    isSuppressed: () => false,
    log: deps.log,
    claim: deps.claim,
    release: deps.release,
    ...(deps.transport ? { transport: deps.transport } : {}),
  });
}

export async function sendMembershipNotice(notice: MembershipNotice, origin: string, deps: MembershipEmailDeps): Promise<SendResult> {
  const mailer = mailerFor(deps);
  const base = { appUrl: origin, settingsUrl: membershipSettingsUrl(origin), supportEmail: deps.env.EMAIL_REPLY_TO ?? "" };

  if (notice.template === "cancellation") {
    const refundAmount =
      notice.refundAmountMinor !== null && notice.refundCurrency ? formatMinor(notice.refundAmountMinor, notice.refundCurrency) : undefined;
    const props: ReaderProps["cancellation"] = {
      ...base,
      cancelMode: notice.cancelMode,
      ...(notice.cancelMode === "period_end" && notice.endsAt ? { endDate: renewalDateWords(notice.endsAt) } : {}),
      ...(refundAmount ? { refundAmount, refundStatus: notice.refundState ?? "pending" } : {}),
    };
    return mailer.sendReader("cancellation", props, { to: notice.to, dedupeKey: notice.dedupeKey });
  }

  const price = notice.amountMinor !== null && notice.currency ? formatMinor(notice.amountMinor, notice.currency) : undefined;
  if (notice.template === "trial_reminder") {
    // The first payment date in UK time, the same as the offer and the day-zero email.
    const firstPaymentDate = ukDateWords(new Date(notice.trialEndsAt));
    const props: ReaderProps["trial_ending"] = {
      ...base,
      firstPaymentDate,
      price: price ?? "the price shown in your account",
      periodWords: notice.plan === "member_year" ? "a year" : "a month",
    };
    return mailer.sendReader("trial_ending", props, { to: notice.to, dedupeKey: notice.dedupeKey });
  }
  if (notice.template === "renewal_notice") {
    const props: ReaderProps["renewal_notice"] = { ...base, renewDate: renewalDateWords(notice.renewsAt), price: price ?? "As shown in your account" };
    return mailer.sendReader("renewal_notice", props, { to: notice.to, dedupeKey: notice.dedupeKey });
  }
  return mailer.sendReader("payment_failed", { ...base, price }, { to: notice.to, dedupeKey: notice.dedupeKey });
}

/**
 * The six-monthly terms reminder for a monthly member: the price, how often
 * they pay, the next payment date and how to cancel. Claims the reminder's
 * dedupe key before it sends and releases it if the send fails.
 */
export async function sendTermsReminder(reminder: TermsReminder, origin: string, deps: MembershipEmailDeps): Promise<SendResult> {
  const price = formatMinor(reminder.amountMinor, reminder.currency);
  if (!price) throw new Error("unknown currency");
  const props: ReaderProps["membership_terms_reminder"] = {
    appUrl: origin,
    settingsUrl: membershipSettingsUrl(origin),
    supportEmail: deps.env.EMAIL_REPLY_TO ?? "",
    price,
    periodWords: "a month",
    nextDate: renewalDateWords(reminder.nextPaymentAt),
  };
  return mailerFor(deps).sendReader("membership_terms_reminder", props, { to: reminder.to, dedupeKey: reminder.dedupeKey });
}
