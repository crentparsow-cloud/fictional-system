import { createMailer, type MailerOptions, type ReaderProps, type SendResult } from "@akana/emails";
import type { MembershipNotice } from "@/lib/stripe-webhook";

/**
 * Sends the membership emails the webhook asks for (F-097): payment_failed
 * and the annual renewal_notice. Neither template takes a title (F-098).
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

export async function sendMembershipNotice(notice: MembershipNotice, origin: string, deps: MembershipEmailDeps): Promise<SendResult> {
  const mailer = createMailer({
    env: deps.env,
    isSuppressed: () => false,
    log: deps.log,
    claim: deps.claim,
    release: deps.release,
    ...(deps.transport ? { transport: deps.transport } : {}),
  });
  const price = notice.amountMinor !== null && notice.currency ? formatMinor(notice.amountMinor, notice.currency) : undefined;
  const base = { appUrl: origin, settingsUrl: membershipSettingsUrl(origin), supportEmail: deps.env.EMAIL_REPLY_TO ?? "" };

  if (notice.template === "renewal_notice") {
    const props: ReaderProps["renewal_notice"] = { ...base, renewDate: renewalDateWords(notice.renewsAt), price: price ?? "As shown in your account" };
    return mailer.sendReader("renewal_notice", props, { to: notice.to, dedupeKey: notice.dedupeKey });
  }
  return mailer.sendReader("payment_failed", { ...base, price }, { to: notice.to, dedupeKey: notice.dedupeKey });
}
