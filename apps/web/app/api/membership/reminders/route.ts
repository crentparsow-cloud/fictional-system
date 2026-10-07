import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorised } from "@/lib/cron-auth";
import { sendTermsReminder } from "@/lib/membership-email";
import { runTermsReminders, type DueTermsReminder } from "@/lib/membership-reminders";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The six-monthly terms reminder for monthly members (UK DMCC Act
 * subscription regime, expected January 2027). Runs once a day.
 *
 *   GET or POST /api/membership/reminders
 *   Authorization: Bearer <CRON_SECRET>   (Vercel Cron sends this itself)
 *   -> { due, sent, already_sent, no_price, not_due, failed, stamp_failed }
 *
 * public.due_terms_reminders() (migration 0011) lists the monthly members
 * whose last reminder, or start, was six months ago or more and whose next
 * renewal is 3 to 14 days away. Each one gets membership_terms_reminder: the
 * price, how often they pay, the next payment date and how to cancel, never
 * a title. The dedupe key is claimed in public.email_claims before the send
 * and released if the send fails; then public.mark_terms_reminder_sent()
 * stamps the subscription so it is not due again for six months. The rule
 * and the counts are in lib/membership-reminders.ts.
 *
 * With CRON_SECRET unset the route does nothing and says so. Addresses and
 * ids are never logged or returned, only counts.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

type DueRow = {
  stripe_subscription_id: string;
  email: string;
  current_period_end: string;
  reminder_anchor_at: string;
  amount_minor: number | null;
  currency: string | null;
};

async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });
  if (!cronAuthorised(request.headers, secret)) return NextResponse.json({ error: "unauthorised" }, { status: 401, headers: NO_STORE });

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });
  }

  const env = process.env;
  const origin = siteOrigin(request);
  try {
    const result = await runTermsReminders({
      now: new Date(),
      async due(now) {
        const { data, error } = await admin.rpc("due_terms_reminders", { p_now: now.toISOString() });
        if (error) throw new SqlError(error.code);
        return ((data ?? []) as DueRow[]).map(
          (r): DueTermsReminder => ({
            subscriptionId: r.stripe_subscription_id,
            email: r.email,
            currentPeriodEnd: r.current_period_end,
            reminderAnchorAt: r.reminder_anchor_at,
            amountMinor: r.amount_minor,
            currency: r.currency ? r.currency.trim() : null,
          }),
        );
      },
      send: (reminder) =>
        sendTermsReminder(reminder, origin, {
          env: {
            RESEND_API_KEY: env.RESEND_API_KEY,
            EMAIL_FROM: env.EMAIL_FROM,
            EMAIL_REPLY_TO: env.EMAIL_REPLY_TO,
            POSTAL_ADDRESS: env.POSTAL_ADDRESS,
            EMAIL_MODE: env.EMAIL_MODE,
            TEST_RECIPIENT: env.TEST_RECIPIENT,
          },
          async claim(key) {
            const { data, error } = await admin.rpc("claim_email", { p_key: key });
            if (error) throw new SqlError(error.code);
            return data === true;
          },
          async release(key) {
            const { error } = await admin.rpc("release_email", { p_key: key });
            if (error) console.error("terms_reminder_release_failed", error.code ?? "unknown");
          },
          log: (e) => console.info("membership_email", e.template, e.status, e.reason ?? ""),
        }),
      async markSent(subscriptionId, at) {
        const { error } = await admin.rpc("mark_terms_reminder_sent", { p_subscription: subscriptionId, p_at: at.toISOString() });
        if (error) throw new SqlError(error.code);
      },
      log: (code, detail) => console.error(code, detail ?? ""),
    });
    if (result.failed || result.stamp_failed) console.error("terms_reminder_counts", result.failed, result.stamp_failed);
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (err) {
    console.error("due_terms_reminders_failed", err instanceof SqlError ? err.code : "unknown");
    return NextResponse.json({ error: "sql_failed" }, { status: 500, headers: NO_STORE });
  }
}

class SqlError extends Error {
  constructor(public code: string | undefined) {
    super("sql_failed");
  }
}

/** The public origin for links in the email. */
function siteOrigin(request: NextRequest): string {
  const host = process.env.AKANA_HOST ?? request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

export const GET = run;
export const POST = run;
