import { NextResponse, type NextRequest } from "next/server";
import { reportOps } from "@/lib/ops-alerts";
import { configNumber, cronSetup, NO_STORE, PICKUP_GAP_DAYS, pickupDeps, SqlError } from "@/lib/today/jobs";
import { runPickup } from "@/lib/today/run-reminders";

/**
 * The pick-up check (4.9). Once a day it looks for readers who turned
 * reminders on and have not opened or finished anything in a programme for
 * 14 days or more (pickup_gap_days in app_config), and sends each one short,
 * plain note: "Welcome back". No discount, no offer, no count of days.
 *
 *   GET or POST /api/today/pickup
 *   Authorization: Bearer <CRON_SECRET>
 *   -> { considered, no_gap, not_allowed, recently_mailed, sent, already_sent, failed }
 *
 * One note per gap: the mail key is the programme and the date the reader
 * was last active. A programme that was mailed in the last 36 hours is left
 * alone. Wellbeing titles stay off until the reader switches the welcome-back
 * note on from You. The same screen note on Today needs no job: Today works
 * it out when the reader opens it.
 *
 * Supabase Cron runs this daily (job akana-pickup-check). Running it from
 * Vercel Cron as well is safe: the second run sends nothing.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function run(request: NextRequest) {
  const setup = cronSetup(request);
  if (!setup.ok) return setup.response;
  const { admin, origin } = setup;
  try {
    const gap = await configNumber(admin, "pickup_gap_days", PICKUP_GAP_DAYS);
    const counts = await runPickup(pickupDeps(admin, origin, new Date(), gap));
    if (counts.failed) await reportOps(admin, "email_failure", "api/today/pickup", "send_failed");
    return NextResponse.json(counts, { headers: NO_STORE });
  } catch (err) {
    console.error("today_pickup_failed", err instanceof SqlError ? err.code : "unknown");
    await reportOps(admin, "cron_failure", "api/today/pickup", err instanceof SqlError ? (err.code ?? "sql_failed") : "unknown");
    return NextResponse.json({ error: "failed" }, { status: 500, headers: NO_STORE });
  }
}

export const GET = run;
export const POST = run;
