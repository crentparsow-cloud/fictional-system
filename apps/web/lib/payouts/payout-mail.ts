import "server-only";
import { createMailer, type MailerEnv, type Transport } from "@akana/emails";
import { mailLog } from "@/lib/mail-ops";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * The security notice when payout details change (F-143). It goes to every
 * owner and finance contact of the organisation, not only to the person who
 * made the change, so a takeover of one account is seen by the others.
 * Best effort: a failure is logged and never undoes the change.
 *
 * Each recipient's send is claimed in public.email_claims (migration 0010)
 * under <dedupe key>:<user id>, so a replayed webhook sends nothing new.
 * Logs carry the template and status only.
 */

type Admin = ReturnType<typeof createAdminClient>;

export interface PayoutChangeMail {
  orgId: string;
  what: string;
  dedupeKey: string;
  origin: string;
  now?: Date;
  transport?: Transport;
}

export const PAYOUT_CHANGE_COPY = {
  bank_created: "A bank account for payouts was added in Stripe.",
  bank_updated: "The bank account for payouts was updated in Stripe.",
  bank_deleted: "A bank account for payouts was removed in Stripe.",
  tax: "The tax residence and treaty declaration were updated.",
} as const;

export function mailerEnv(): MailerEnv {
  return {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO,
    POSTAL_ADDRESS: process.env.POSTAL_ADDRESS,
    EMAIL_MODE: process.env.EMAIL_MODE,
    TEST_RECIPIENT: process.env.TEST_RECIPIENT,
  };
}

export async function sendPayoutChangeEmails(admin: Admin, m: PayoutChangeMail): Promise<void> {
  try {
    const { data: contacts, error } = await admin.rpc("payout_contacts", { p_org: m.orgId });
    if (error) throw new Error(`payout_contacts failed: ${error.code ?? error.message}`);
    const { data: org } = await admin.from("organisations").select("display_name").eq("id", m.orgId).maybeSingle();
    const env = mailerEnv();
    const mailer = createMailer({
      env,
      isSuppressed: () => false,
      log: mailLog("payouts", "payout_mail"),
      async claim(key) {
        const { data, error: cErr } = await admin.rpc("claim_email", { p_key: key });
        if (cErr) throw new Error(`claim_email failed: ${cErr.code ?? cErr.message}`);
        return data === true;
      },
      async release(key) {
        const { error: rErr } = await admin.rpc("release_email", { p_key: key });
        if (rErr) console.error("payout_mail_release_failed", rErr.code ?? "");
      },
      ...(m.transport ? { transport: m.transport } : {}),
    });
    const changedAt = (m.now ?? new Date()).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/London" });
    const payoutsUrl = `${m.origin}/payouts`;
    for (const c of (contacts ?? []) as { user_id: string; email: string }[]) {
      await mailer.sendAuthor(
        "payout_details_changed",
        {
          studioUrl: payoutsUrl,
          supportEmail: env.EMAIL_REPLY_TO ?? "",
          organisationName: (org?.display_name as string | undefined) ?? "your organisation",
          what: m.what,
          changedAt,
          payoutsUrl,
        },
        { to: c.email, userId: c.user_id, dedupeKey: `${m.dedupeKey}:${c.user_id}` },
      );
    }
  } catch (err) {
    console.error("payout_mail_failed", { reason: err instanceof Error ? err.name : "unknown" });
  }
}
