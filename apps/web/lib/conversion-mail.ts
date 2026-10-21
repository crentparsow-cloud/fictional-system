import "server-only";
import { createMailer, type MailerEnv, type ReaderProps, type SendResult, type Transport } from "@akana/emails";
import { claimUrl, giftDateWords, giftLength } from "@/lib/gift";
import { mailLog } from "@/lib/mail-ops";
import { mailerEnvFromProcess } from "@/lib/partner-mail";
import { siteOrigin } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { readerBase } from "@/lib/support-actions";

/**
 * The emails of the conversion work: the gift pair (5.6), the student price
 * (14.22) and the win-back note. None names a workbook title. Each send
 * claims a dedupe key in public.email_claims (0010) first and releases it if
 * the send fails, so a repeat webhook or cron run sends once and a failed
 * send can be tried again.
 *
 * A send never throws. It returns whether the message has gone (true for
 * sent, a test send, or already sent earlier) so a caller can decide whether
 * to mark the work done.
 */

type Opts = { env?: MailerEnv; transport?: Transport; origin?: string };

function mailer(env: MailerEnv, transport: Transport | undefined) {
  let admin: ReturnType<typeof createAdminClient> | null = null;
  try {
    admin = createAdminClient();
  } catch {
    admin = null;
  }
  return createMailer({
    env,
    isSuppressed: () => false,
    log: mailLog("conversion/mail", "conversion_mail"),
    ...(admin
      ? {
          async claim(key: string) {
            const { data, error } = await admin.rpc("claim_email", { p_key: key });
            if (error) throw new Error(`claim_email failed: ${error.code ?? "unknown"}`);
            return data === true;
          },
          async release(key: string) {
            const { error } = await admin.rpc("release_email", { p_key: key });
            if (error) console.error("conversion_mail_release_failed", error.code ?? "");
          },
        }
      : {}),
    ...(transport ? { transport } : {}),
  });
}

const gone = (r: SendResult) => r.status === "sent" || r.status === "sent_test" || (r.status === "skipped" && r.reason === "already_sent");

async function run(name: string, send: () => Promise<SendResult>): Promise<boolean> {
  try {
    return gone(await send());
  } catch (e) {
    console.error("conversion_mail_failed", name, e instanceof Error ? e.name : "unknown");
    return false;
  }
}

export interface GiftMailData {
  id: string;
  months: number;
  recipientEmail: string;
  recipientName: string | null;
  senderName: string | null;
  message: string | null;
  token: string;
  claimBy: string | null;
}

/** The claim email to the recipient. */
export function sendGiftReceived(g: GiftMailData, o: Opts = {}): Promise<boolean> {
  const env = o.env ?? mailerEnvFromProcess();
  const origin = o.origin ?? siteOrigin();
  const props: ReaderProps["gift_received"] = {
    ...readerBase(origin, env.EMAIL_REPLY_TO ?? "", g.recipientName),
    senderName: g.senderName ?? "Someone",
    months: giftLength(g.months),
    claimUrl: claimUrl(origin, g.token),
    claimBy: g.claimBy ? giftDateWords(g.claimBy) : "within a year",
    ...(g.message ? { message: g.message } : {}),
  };
  return run("gift_received", () => mailer(env, o.transport).sendReader("gift_received", props, { to: g.recipientEmail, dedupeKey: `gift_received:${g.id}` }));
}

/** The note to the buyer. */
export function sendGiftSent(g: Pick<GiftMailData, "id" | "months" | "recipientName" | "claimBy">, buyer: { email: string; name: string | null; userId: string }, o: Opts = {}): Promise<boolean> {
  const env = o.env ?? mailerEnvFromProcess();
  const origin = o.origin ?? siteOrigin();
  const props: ReaderProps["gift_sent"] = {
    ...readerBase(origin, env.EMAIL_REPLY_TO ?? "", buyer.name),
    months: giftLength(g.months),
    ...(g.recipientName ? { recipientName: g.recipientName } : {}),
    claimBy: g.claimBy ? giftDateWords(g.claimBy) : "within a year",
  };
  return run("gift_sent", () => mailer(env, o.transport).sendReader("gift_sent", props, { to: buyer.email, userId: buyer.userId, dedupeKey: `gift_sent:${g.id}` }));
}

export function sendStudentVerify(a: { email: string; userId: string; token: string; validHours: number; key: string }, o: Opts = {}): Promise<boolean> {
  const env = o.env ?? mailerEnvFromProcess();
  const origin = o.origin ?? siteOrigin();
  const props: ReaderProps["student_verify"] = {
    ...readerBase(origin, env.EMAIL_REPLY_TO ?? "", null),
    verifyUrl: `${origin}/student/verify/${a.token}`,
    validHours: a.validHours === 1 ? "1 hour" : `${a.validHours} hours`,
  };
  return run("student_verify", () => mailer(env, o.transport).sendReader("student_verify", props, { to: a.email, userId: a.userId, dedupeKey: `student_verify:${a.key}` }));
}

export function sendStudentRecheck(a: { email: string; userId: string; endsAt: string; percent: number }, o: Opts = {}): Promise<boolean> {
  const env = o.env ?? mailerEnvFromProcess();
  const origin = o.origin ?? siteOrigin();
  const props: ReaderProps["student_recheck"] = {
    ...readerBase(origin, env.EMAIL_REPLY_TO ?? "", null),
    recheckUrl: `${origin}/you/student`,
    endDate: giftDateWords(a.endsAt),
    percent: `${a.percent} percent`,
  };
  return run("student_recheck", () =>
    mailer(env, o.transport).sendReader("student_recheck", props, { to: a.email, userId: a.userId, dedupeKey: `student_recheck:${a.userId}:${a.endsAt.slice(0, 10)}` }),
  );
}

export function sendStudentEnded(a: { email: string; userId: string; endedOn: string }, o: Opts = {}): Promise<boolean> {
  const env = o.env ?? mailerEnvFromProcess();
  const origin = o.origin ?? siteOrigin();
  const props: ReaderProps["student_ended"] = { ...readerBase(origin, env.EMAIL_REPLY_TO ?? "", null), recheckUrl: `${origin}/you/student` };
  return run("student_ended", () => mailer(env, o.transport).sendReader("student_ended", props, { to: a.email, userId: a.userId, dedupeKey: `student_ended:${a.userId}:${a.endedOn.slice(0, 10)}` }));
}

/** The win-back note. A marketing message: the mailer refuses it without an unsubscribe link. */
export function sendWinback(a: { email: string; userId: string; kind: "monthly" | "one_off"; season: string; unsubscribeToken: string }, o: Opts = {}): Promise<boolean> {
  const env = o.env ?? mailerEnvFromProcess();
  const origin = o.origin ?? siteOrigin();
  const props: ReaderProps["winback"] = { ...readerBase(origin, env.EMAIL_REPLY_TO ?? "", null), kind: a.kind, membershipUrl: `${origin}/pricing` };
  const page = `${origin}/unsubscribe/${a.unsubscribeToken}`;
  return run("winback", () =>
    mailer(env, o.transport).sendReader("winback", props, {
      to: a.email,
      userId: a.userId,
      dedupeKey: `winback:${a.userId}:${a.season}`,
      links: { unsubscribe: page, oneClick: `${origin}/api/email/unsubscribe?t=${a.unsubscribeToken}`, manage: `${origin}/you` },
    }),
  );
}
