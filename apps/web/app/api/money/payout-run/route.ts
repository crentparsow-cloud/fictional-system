import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorised } from "@/lib/cron-auth";
import { currentConfig, payoutStore } from "@/lib/money/db";
import { isPayoutDay, runPayouts } from "@/lib/money/payout-run";
import { isTestKey } from "@/lib/money/reconcile";
import { reportOps } from "@/lib/ops-alerts";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Monthly payout run (F-103), TEST MODE ONLY.
 *
 *   GET or POST /api/money/payout-run
 *   Authorization: Bearer <CRON_SECRET>
 *   -> { skipped } or { run_id, paid, failed, errors }
 *
 * Vercel Hobby allows a daily cron at most, so this runs every day and acts
 * only on the payout day in public.royalty_config (London date). It decides
 * per organisation and currency (holds, verification, minimum, first-payout
 * hold, approval threshold; migration 0021), then makes one Stripe transfer
 * per payout with the payout id as the idempotency key.
 *
 * Locked to a test-mode Stripe key: with a live key it does nothing and
 * says so. Lifting that lock is a decision for the go-live meeting.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" } as const;

async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });
  if (!cronAuthorised(request.headers, secret)) return NextResponse.json({ error: "unauthorised" }, { status: 401, headers: NO_STORE });
  if (!isTestKey(process.env.STRIPE_SECRET_KEY)) {
    return NextResponse.json({ skipped: "live_mode_locked" }, { headers: NO_STORE });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });
  }

  try {
    const config = await currentConfig(admin);
    if (!config) return NextResponse.json({ skipped: "no_config" }, { headers: NO_STORE });
    if (!isPayoutDay(new Date(), config.payout_day)) {
      return NextResponse.json({ skipped: "not_payout_day", payout_day: config.payout_day }, { headers: NO_STORE });
    }
    const result = await runPayouts(payoutStore(admin), getStripe().transfers, false, "cron");
    if (result.failed > 0 || result.errors > 0) {
      await reportOps(admin, "payout_failure", "api/money/payout-run", result.errors > 0 ? "record_failed" : "transfer_failed");
    }
    return NextResponse.json(
      { run_id: result.runId, paid: result.paid, failed: result.failed, errors: result.errors },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error("payout_run_failed", err instanceof Error ? err.message : "unknown");
    await reportOps(admin, "cron_failure", "api/money/payout-run", "run_failed");
    return NextResponse.json({ error: "run_failed" }, { status: 500, headers: NO_STORE });
  }
}

export const GET = run;
export const POST = run;
