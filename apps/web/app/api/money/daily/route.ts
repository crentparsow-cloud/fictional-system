import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorised } from "@/lib/cron-auth";
import { mailLog } from "@/lib/mail-ops";
import { sendConnectNudges, type NudgeCandidate, type NudgeContact, type NudgeOutcome } from "@/lib/money/connect-nudge";
import { isTestKey } from "@/lib/money/reconcile";
import { runReconciliation } from "@/lib/money/reconcile-run";
import { reportOps } from "@/lib/ops-alerts";
import { mailerEnv } from "@/lib/payouts/payout-mail";
import { siteOrigin } from "@/lib/site-url";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Daily money job (F-100, F-101).
 *
 *   GET or POST /api/money/daily
 *   Authorization: Bearer <CRON_SECRET>   (Vercel Cron sends this itself)
 *   -> { livemode, reconciliation, pools_closed, statements_closed, connect_nudges }
 *
 * 1. Reconciles the last three days of Stripe balance transactions with the
 *    ledger's receipts, records fees the ledger did not know, and keeps a
 *    run with anything a person should look at (/admin/money).
 * 2. Closes every membership pool month that is past its refund window
 *    (the pool split, D3), then every organisation statement month that is.
 * 3. Nudges organisations whose earnings wait on Stripe Connect onboarding
 *    (0039 connect_nudge_candidates), at most once a week per recipient
 *    through public.email_claims. Without RESEND_API_KEY nothing leaves.
 *
 * Livemode follows the Stripe key: a test key works on test data only.
 * Each step reports its own failure as a cron failure (one alert email) and
 * the others still run.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" } as const;

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
  const livemode = !isTestKey(process.env.STRIPE_SECRET_KEY);
  const failures: string[] = [];

  let reconciliation: Awaited<ReturnType<typeof runReconciliation>> | null = null;
  try {
    reconciliation = await runReconciliation(admin, getStripe(), livemode);
  } catch (err) {
    failures.push("reconcile");
    console.error("money_daily_reconcile_failed", err instanceof Error ? err.message : "unknown");
    await reportOps(admin, "cron_failure", "api/money/daily", "reconcile");
  }

  let poolsClosed: number | null = null;
  const pools = await admin.rpc("close_due_pools", { p_livemode: livemode });
  if (pools.error) {
    failures.push("pools");
    console.error("money_daily_pools_failed", pools.error.code ?? "unknown");
    await reportOps(admin, "cron_failure", "api/money/daily", pools.error.code ?? "pools");
  } else {
    poolsClosed = Number(pools.data ?? 0);
  }

  let statementsClosed: number | null = null;
  const statements = await admin.rpc("close_due_statements", { p_livemode: livemode });
  if (statements.error) {
    failures.push("statements");
    console.error("money_daily_statements_failed", statements.error.code ?? "unknown");
    await reportOps(admin, "cron_failure", "api/money/daily", statements.error.code ?? "statements");
  } else {
    statementsClosed = Number(statements.data ?? 0);
  }

  let nudges: NudgeOutcome | null = null;
  try {
    nudges = await sendConnectNudges(
      {
        async candidates(mode) {
          const { data, error } = await admin.rpc("connect_nudge_candidates", { p_livemode: mode });
          if (error) throw new Error(`connect_nudge_candidates failed: ${error.code ?? "unknown"}`);
          return (data ?? []) as NudgeCandidate[];
        },
        async contacts(orgId) {
          const { data, error } = await admin.rpc("payout_contacts", { p_org: orgId });
          if (error) throw new Error(`payout_contacts failed: ${error.code ?? "unknown"}`);
          return (data ?? []) as NudgeContact[];
        },
        async claim(key) {
          const { data, error } = await admin.rpc("claim_email", { p_key: key });
          if (error) throw new Error(`claim_email failed: ${error.code ?? "unknown"}`);
          return data === true;
        },
        async release(key) {
          const { error } = await admin.rpc("release_email", { p_key: key });
          if (error) console.error("connect_nudge_release_failed", error.code ?? "");
        },
      },
      { env: mailerEnv(), log: mailLog("api/money/daily", "connect_nudge_mail"), origin: siteOrigin() },
      livemode,
    );
  } catch (err) {
    failures.push("connect_nudges");
    console.error("money_daily_nudges_failed", err instanceof Error ? err.message : "unknown");
    await reportOps(admin, "cron_failure", "api/money/daily", "connect_nudges");
  }

  const body = { livemode, reconciliation, pools_closed: poolsClosed, statements_closed: statementsClosed, connect_nudges: nudges, failures };
  return NextResponse.json(body, { status: failures.length ? 500 : 200, headers: NO_STORE });
}

export const GET = run;
export const POST = run;
