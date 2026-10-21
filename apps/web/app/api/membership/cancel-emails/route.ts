import { NextResponse, type NextRequest } from "next/server";
import { CANCEL_EMAIL_RETRY_DAYS, outcomeOf, retryCancellationEmails, type CancelCandidate } from "@/lib/cancellation-confirm";
import { cronAuthorised } from "@/lib/cron-auth";
import { sendMembershipNotice } from "@/lib/membership-email";
import { reportOps } from "@/lib/ops-alerts";
import { periodEndCancellation } from "@/lib/stripe-webhook";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Retries the cancellation confirmation (R9, the 24-hour duty). Runs once a
 * day.
 *
 *   GET or POST /api/membership/cancel-emails
 *   Authorization: Bearer <CRON_SECRET>   (Vercel Cron sends this itself)
 *   -> { checked, sent, already_sent, no_address, failed }
 *
 * Takes every membership set to end at period end that changed in the last
 * few days and sends the same confirmation the webhook sends. The dedupe key
 * is claimed in public.email_claims first, so a reader who already has the
 * email gets nothing more. A send that still fails raises an ops alert
 * through reportOps. See lib/cancellation-confirm.ts.
 *
 * With CRON_SECRET unset the route does nothing and says so. Addresses and
 * ids are never logged or returned, only counts.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

type Row = { stripe_subscription_id: string; user_id: string; cancel_at: string | null; current_period_end: string | null };

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
    const result = await retryCancellationEmails({
      now: new Date(),
      async candidates(since) {
        const { data, error } = await admin
          .from("subscriptions")
          .select("stripe_subscription_id, user_id, cancel_at, current_period_end")
          .eq("cancel_at_period_end", true)
          .in("status", ["active", "trialing", "past_due"])
          .gte("updated_at", since.toISOString())
          .limit(500);
        if (error) throw new Error(`subscriptions read failed: ${error.code ?? "unknown"}`);
        return ((data ?? []) as Row[]).map((r): CancelCandidate => ({ subscriptionId: r.stripe_subscription_id, userId: r.user_id, endsAt: r.cancel_at ?? r.current_period_end }));
      },
      async send(c) {
        const { data, error } = await admin.auth.admin.getUserById(c.userId);
        const to = error ? null : (data?.user?.email ?? null);
        if (!to) return "no_address";
        const res = await sendMembershipNotice(periodEndCancellation(c.subscriptionId, to, c.endsAt), origin, {
          env: {
            RESEND_API_KEY: env.RESEND_API_KEY,
            EMAIL_FROM: env.EMAIL_FROM,
            EMAIL_REPLY_TO: env.EMAIL_REPLY_TO,
            POSTAL_ADDRESS: env.POSTAL_ADDRESS,
            EMAIL_MODE: env.EMAIL_MODE,
            TEST_RECIPIENT: env.TEST_RECIPIENT,
          },
          async claim(key) {
            const { data: ok, error: e } = await admin.rpc("claim_email", { p_key: key });
            if (e) throw new Error(`claim_email failed: ${e.code ?? "unknown"}`);
            return ok === true;
          },
          async release(key) {
            const { error: e } = await admin.rpc("release_email", { p_key: key });
            if (e) console.error("cancel_email_release_failed", e.code ?? "unknown");
          },
          log: (e) => console.info("membership_email", e.template, e.status, e.reason ?? ""),
        });
        return outcomeOf(res.status);
      },
      async alert(code) {
        await reportOps(admin, "cron_failure", "api/membership/cancel-emails", code);
      },
    });
    return NextResponse.json({ ...result, window_days: CANCEL_EMAIL_RETRY_DAYS }, { headers: NO_STORE });
  } catch (err) {
    console.error("cancel_emails_failed", err instanceof Error ? err.name : "unknown");
    await reportOps(admin, "cron_failure", "api/membership/cancel-emails", "sql_failed");
    return NextResponse.json({ error: "failed" }, { status: 500, headers: NO_STORE });
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
