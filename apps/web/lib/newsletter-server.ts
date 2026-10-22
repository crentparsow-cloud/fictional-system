import "server-only";
import { createMailer, type MailerEnv, type SendResult } from "@akana/emails";
import { mailLog } from "@/lib/mail-ops";
import { confirmUrl, exerciseParagraphs, oneClickUrl, unsubscribeUrl, type DueIssue, type Recipient, type SendOutcome } from "@/lib/newsletter";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The server side of the newsletter (6.11): the service-role calls and the
 * mailer. Every function here takes the admin client so a route builds it
 * once. Addresses and tokens are never logged; the send log keeps a hash.
 */
type Admin = ReturnType<typeof createAdminClient>;

export function mailerEnvFromProcess(env: NodeJS.ProcessEnv = process.env): MailerEnv {
  return {
    RESEND_API_KEY: env.RESEND_API_KEY,
    EMAIL_FROM: env.EMAIL_FROM,
    EMAIL_REPLY_TO: env.EMAIL_REPLY_TO,
    POSTAL_ADDRESS: env.POSTAL_ADDRESS,
    EMAIL_MODE: env.EMAIL_MODE,
    TEST_RECIPIENT: env.TEST_RECIPIENT,
  };
}

function mailer(admin: Admin) {
  return createMailer({
    env: mailerEnvFromProcess(),
    isSuppressed: () => false,
    log: mailLog("newsletter", "newsletter_email"),
    async claim(key) {
      const { data, error } = await admin.rpc("claim_email", { p_key: key });
      if (error) throw new Error(error.code ?? "claim_failed");
      return data === true;
    },
    async release(key) {
      const { error } = await admin.rpc("release_email", { p_key: key });
      if (error) console.error("newsletter_release_failed", error.code ?? "unknown");
    },
  });
}

/** Double opt-in: the confirmation email with the one link. Sent as transactional mail. */
export function sendConfirmation(admin: Admin, to: string, token: string, origin: string): Promise<SendResult> {
  return mailer(admin).sendNewsletter("newsletter_confirm", { appUrl: origin, confirmUrl: confirmUrl(origin, token) }, { to });
}

/** One issue to one person, with their own unsubscribe links. Claimed once per issue and person. */
export async function sendIssue(admin: Admin, issue: DueIssue, to: Recipient, origin: string): Promise<SendOutcome> {
  const result = await mailer(admin).sendNewsletter(
    "newsletter_issue",
    {
      appUrl: origin,
      subject: issue.subject,
      preheader: issue.preheader,
      intro: issue.intro,
      exerciseHeading: issue.exerciseHeading,
      exerciseParagraphs: exerciseParagraphs(issue.exerciseBody),
      ...(issue.sponsor ? { sponsor: issue.sponsor } : {}),
    },
    {
      to: to.email,
      dedupeKey: `newsletter:${issue.id}:${to.subscriberId}`,
      links: { unsubscribe: unsubscribeUrl(origin, to.token), oneClick: oneClickUrl(origin, to.token) },
    },
  );
  if (result.status === "sent" || result.status === "sent_test") return "sent";
  // Claimed on an earlier run whose result was not recorded: it went out.
  if (result.status === "skipped") return "sent";
  if (result.status === "refused") return "refused";
  return "failed";
}
