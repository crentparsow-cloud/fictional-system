import "server-only";
import { createMailer, type MailerEnv, type ReaderProps, type SendResult, type Transport } from "@akana/emails";
import { mailLog } from "@/lib/mail-ops";
import { mailerEnvFromProcess } from "@/lib/partner-mail";
import { siteOrigin } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { readerBase, refundProps, resendProps, type ResendContext } from "@/lib/support-actions";
import { refundMailKey } from "@/lib/stripe-webhook";

/**
 * Reader emails sent by staff actions (F-087, F-102): the refund
 * confirmation, the deletion-cancelled confirmation and the resent purchase
 * or membership email. None names a title. Failed sends are reported as
 * email_failure ops events (lib/mail-ops.ts).
 *
 * The refund confirmation is sent once per Stripe refund: its dedupe key
 * (refund:<re_ id>) is claimed in public.email_claims (0010) with the service
 * role before the send and released if the send fails, so a retried action
 * or a double submit sends one email.
 *
 * Without RESEND_API_KEY the mailer records the send in its dev transport
 * and nothing leaves. EMAIL_MODE other than "live" goes to TEST_RECIPIENT.
 */

type SendStatus = SendResult["status"] | "no_address" | "no_figures";
type Opts = { env?: MailerEnv; transport?: Transport; origin?: string };

function adminOrNull() {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

function mailer(o: Opts, source: string, admin: ReturnType<typeof adminOrNull>) {
  return createMailer({
    env: o.env ?? mailerEnvFromProcess(),
    isSuppressed: () => false,
    log: mailLog(source, "support_mail"),
    ...(admin
      ? {
          async claim(key: string) {
            const { data, error } = await admin.rpc("claim_email", { p_key: key });
            if (error) throw new Error(`claim_email failed: ${error.code ?? "unknown"}`);
            return data === true;
          },
          async release(key: string) {
            const { error } = await admin.rpc("release_email", { p_key: key });
            if (error) console.error("support_mail_release_failed", error.code ?? "");
          },
        }
      : {}),
    ...(o.transport ? { transport: o.transport } : {}),
  });
}

/** The reader's sign-in address and first name, read with the service role. */
async function readerAddress(admin: NonNullable<ReturnType<typeof adminOrNull>>, userId: string): Promise<{ email: string; name: string | null } | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user?.email) return null;
  const { data: profile } = await admin.from("profiles").select("display_name").eq("user_id", userId).maybeSingle();
  return { email: data.user.email, name: (profile as { display_name?: string | null } | null)?.display_name ?? null };
}

/**
 * refund_confirmed, for a single-workbook refund made from the refund path.
 * Never throws: the refund is done whatever happens to the email.
 */
export async function sendRefundConfirmation(
  a: { userId: string; refundId: string; amountMinor: number; currency: string; accessEnded: boolean },
  o: Opts = {},
): Promise<SendStatus> {
  try {
    const admin = adminOrNull();
    if (!admin) return "no_address";
    const who = await readerAddress(admin, a.userId);
    if (!who) return "no_address";
    const env = o.env ?? mailerEnvFromProcess();
    const props = refundProps(readerBase(o.origin ?? siteOrigin(), env.EMAIL_REPLY_TO ?? "", who.name), a.amountMinor, a.currency, a.accessEnded);
    if (!props) return "no_figures";
    const r = await mailer({ ...o, env }, "admin/money/refunds", admin).sendReader("refund_confirmed", props, {
      to: who.email,
      userId: a.userId,
      // The webhook claims the same key on charge.refunded, so only one sends.
      dedupeKey: refundMailKey(a.refundId),
    });
    return r.status;
  } catch (e) {
    console.error("support_mail_failed", "refund_confirmed", e instanceof Error ? e.name : "unknown");
    return "failed";
  }
}

/** deletion_cancelled, after staff cancelled a pending deletion for the reader. */
export async function sendDeletionCancelled(a: { userId: string; email: string; name: string | null }, o: Opts = {}): Promise<SendStatus> {
  try {
    const env = o.env ?? mailerEnvFromProcess();
    const props: ReaderProps["deletion_cancelled"] = readerBase(o.origin ?? siteOrigin(), env.EMAIL_REPLY_TO ?? "", a.name);
    const r = await mailer({ ...o, env }, "admin/lookup", null).sendReader("deletion_cancelled", props, { to: a.email, userId: a.userId });
    return r.status;
  } catch (e) {
    console.error("support_mail_failed", "deletion_cancelled", e instanceof Error ? e.name : "unknown");
    return "failed";
  }
}

/** The purchase or membership email again, from the context 0027 returned. */
export async function sendResend(userId: string, c: ResendContext, o: Opts = {}): Promise<SendStatus> {
  try {
    const env = o.env ?? mailerEnvFromProcess();
    const made = resendProps(c, readerBase(o.origin ?? siteOrigin(), env.EMAIL_REPLY_TO ?? "", c.name));
    if (!made) return "no_figures";
    const m = mailer({ ...o, env }, "admin/lookup", null);
    const r =
      made.template === "purchase_lifetime"
        ? await m.sendReader("purchase_lifetime", made.props, { to: c.email, userId })
        : await m.sendReader("purchase_membership", made.props, { to: c.email, userId });
    return r.status;
  } catch (e) {
    console.error("support_mail_failed", "resend", e instanceof Error ? e.name : "unknown");
    return "failed";
  }
}
