/**
 * The one email to a reviewer when a version is assigned to them (F-084).
 * It names the AK code, never the title. Without RESEND_API_KEY the dev
 * transport records it and nothing leaves. EMAIL_MODE rules apply as for
 * every other send.
 */
import { createDevTransport, createMailer, type MailerEnv, type SendLogEntry, type Transport } from "@akana/emails";
import { mailLog } from "@/lib/mail-ops";

export async function sendReviewAssigned(
  to: string,
  x: { code: string; versionId: string; assignedBy?: string | null },
  o: { env: MailerEnv; origin: string; transport?: Transport; log?: (e: SendLogEntry) => void },
): Promise<boolean> {
  const live = Boolean(o.env.RESEND_API_KEY);
  const dev = live || o.transport ? null : createDevTransport();
  const env: MailerEnv = live ? o.env : { EMAIL_MODE: "live", EMAIL_FROM: o.env.EMAIL_FROM || "Akana <dev@localhost>", POSTAL_ADDRESS: o.env.POSTAL_ADDRESS };
  const mailer = createMailer({
    env,
    isSuppressed: () => false,
    log: o.log ?? mailLog("admin/review/assign", "review_assigned_email"),
    transport: o.transport ?? dev?.transport,
  });
  const r = await mailer.sendAuthor(
    "review_assigned",
    {
      studioUrl: `${o.origin}/admin/review/${x.versionId}`,
      supportEmail: o.env.EMAIL_REPLY_TO || "",
      code: x.code,
      assignedBy: x.assignedBy ?? undefined,
    },
    { to },
  );
  return r.status === "sent" || r.status === "sent_test";
}
