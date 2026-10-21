import "server-only";
import { createMailer, type MailerEnv, type SendResult, type Transport } from "@akana/emails";
import { mailLog } from "@/lib/mail-ops";
import { mailerEnvFromProcess } from "@/lib/partner-mail";
import { giftUrl, longDateGB } from "@/lib/send-workbook";

/**
 * The "Send this workbook" email (14.14). One template, gift_workbook, to the
 * person receiving the gift. It carries the claim link, the date the link
 * stops working and the support address, nothing else: no workbook title and
 * no name for the giver (packages/emails/src/gift.test.ts renders it against
 * every title in the catalogue). The log keeps a hash of the address, never
 * the address. Without RESEND_API_KEY the mailer's dev transport records the
 * send and nothing leaves; EMAIL_MODE other than "live" sends to
 * TEST_RECIPIENT with a [Test] subject.
 */
export async function sendGiftEmail(
  a: { to: string; token: string; expiresAt: Date; giftId: string },
  o: { env?: MailerEnv; transport?: Transport; origin: string },
): Promise<SendResult> {
  const env = o.env ?? mailerEnvFromProcess();
  const mailer = createMailer({
    env,
    isSuppressed: () => false,
    log: mailLog("you/invite", "gift_email"),
    ...(o.transport ? { transport: o.transport } : {}),
  });
  return mailer.sendGift(
    { claimUrl: giftUrl(o.origin, a.token), expiresOn: longDateGB(a.expiresAt), supportEmail: env.EMAIL_REPLY_TO ?? "" },
    { to: a.to, dedupeKey: `gift:${a.giftId}` },
  );
}
