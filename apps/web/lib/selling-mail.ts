import "server-only";
import { createMailer, type MailerEnv, type ReaderProps, type SendResult, type Transport } from "@akana/emails";
import { mailLog } from "@/lib/mail-ops";
import { formatMinor } from "@/lib/membership-email";
import { pauseDateWords } from "@/lib/membership-pause";
import { mailerEnvFromProcess } from "@/lib/partner-mail";
import { siteOrigin } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { readerBase } from "@/lib/support-actions";
import type { CancelMailApi } from "@/lib/membership-cancel";

/**
 * Emails sent straight from the cancel and pause actions (14.24, 14.25):
 * the pause confirmation, and the note that a paused membership has ended.
 * An ordinary cancel is emailed by the Stripe webhook, which also knows
 * whether a 14-day refund applies, so nothing here sends that one.
 *
 * Each send claims a dedupe key in public.email_claims (0010) first and
 * releases it if the send fails, so a double submit sends once. No title is
 * ever in either email. Failures are logged by name and never thrown: the
 * Stripe change has been made, and the You page shows the new state.
 */

type Opts = { env?: MailerEnv; transport?: Transport; origin?: string };

function mailerFor(env: MailerEnv, transport: Transport | undefined) {
  let admin: ReturnType<typeof createAdminClient> | null = null;
  try {
    admin = createAdminClient();
  } catch {
    admin = null;
  }
  return createMailer({
    env,
    isSuppressed: () => false,
    log: mailLog("membership/cancel", "selling_mail"),
    ...(admin
      ? {
          async claim(key: string) {
            const { data, error } = await admin.rpc("claim_email", { p_key: key });
            if (error) throw new Error(`claim_email failed: ${error.code ?? "unknown"}`);
            return data === true;
          },
          async release(key: string) {
            const { error } = await admin.rpc("release_email", { p_key: key });
            if (error) console.error("selling_mail_release_failed", error.code ?? "");
          },
        }
      : {}),
    ...(transport ? { transport } : {}),
  });
}

export interface Recipient {
  userId: string;
  email: string;
  name: string | null;
  /** The renewal price in minor units and currency, for the pause email. */
  priceMinor?: number | null;
  currency?: string | null;
}

/** A CancelMailApi for one reader. */
export function cancelMailFor(who: Recipient, o: Opts = {}): CancelMailApi {
  const env = o.env ?? mailerEnvFromProcess();
  const base = () => readerBase(o.origin ?? siteOrigin(), env.EMAIL_REPLY_TO ?? "", who.name);
  const run = async (name: string, send: () => Promise<SendResult>): Promise<SendResult["status"] | "failed"> => {
    try {
      return (await send()).status;
    } catch (e) {
      console.error("selling_mail_failed", name, e instanceof Error ? e.name : "unknown");
      return "failed";
    }
  };
  return {
    async paused(a) {
      const price = who.priceMinor != null && who.currency ? formatMinor(who.priceMinor, who.currency) : undefined;
      const props: ReaderProps["membership_paused"] = {
        ...base(),
        pauseFrom: pauseDateWords(a.from),
        resumeDate: pauseDateWords(a.until),
        price: price ?? "the price shown in your account",
        periodWords: "a month",
      };
      return run("paused", () =>
        mailerFor(env, o.transport).sendReader("membership_paused", props, {
          to: who.email,
          userId: who.userId,
          dedupeKey: `membership_paused:${a.subscriptionId}:${a.until.toISOString().slice(0, 10)}`,
        }),
      );
    },
    async endedNow(a) {
      const props: ReaderProps["cancellation"] = { ...base(), cancelMode: "immediate" };
      return run("ended_now", () =>
        mailerFor(env, o.transport).sendReader("cancellation", props, {
          to: who.email,
          userId: who.userId,
          dedupeKey: `cancellation:${a.subscriptionId}:immediate`,
        }),
      );
    },
  };
}

