import { createMailer, type MailerOptions, type ReaderProps, type SendResult } from "@akana/emails";
import { dateWords, moneyWords, readerBase } from "@/lib/support-actions";
import type { ReaderMailNotice } from "@/lib/stripe-webhook";

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

export async function sendPurchaseEmail(n: ReaderMailNotice, origin: string, deps: PurchaseEmailDeps): Promise<PurchaseEmailStatus> {
  const made = purchaseEmailProps(n, origin, deps.env.EMAIL_REPLY_TO ?? "");
  if (!made) return "no_figures";
  const mailer = createMailer({
    env: deps.env,
    isSuppressed: () => false,
    log: deps.log,
    claim: deps.claim,
    release: deps.release,
    ...(deps.transport ? { transport: deps.transport } : {}),
  });
  const opts = { to: n.to, dedupeKey: n.dedupeKey, ...(n.userId ? { userId: n.userId } : {}) };
  const r =
    made.template === "purchase_lifetime"
      ? await mailer.sendReader("purchase_lifetime", made.props, opts)
      : made.template === "purchase_membership"
        ? await mailer.sendReader("purchase_membership", made.props, opts)
        : await mailer.sendReader("refund_confirmed", made.props, opts);
  return r.status;
}
