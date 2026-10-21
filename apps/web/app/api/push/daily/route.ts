import { NextResponse, type NextRequest } from "next/server";
import { reportOps } from "@/lib/ops-alerts";
import { runDailyPush } from "@/lib/push/run";
import { pushDeps } from "@/lib/push/jobs";
import { vapidFromEnv } from "@/lib/push/vapid";
import { configNumber, cronSetup, DEFAULT_STOP_AFTER, NO_STORE } from "@/lib/today/jobs";

/**
 * The daily step push for installed readers (13.19).
 *
 *   GET or POST /api/push/daily
 *   Authorization: Bearer <CRON_SECRET>
 *   -> { considered, not_due, not_allowed, no_subscription, nothing_waiting,
 *        stopped, already_sent, sent, failed }
 *
 * Meant to run every 15 minutes, like the email reminders (Supabase Cron job
 * akana-push-daily, migration 0065). It uses the reader's own reminder days
 * and time. It sends a push with no body: the wording is fixed in the service
 * worker, so no title or step is ever sent to a push service. Never for a
 * title above safety tier none. Once a day, around 04:00 UTC, it also clears
 * old push and pairing rows.
 *
 * With VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY or VAPID_SUBJECT blank it does
 * nothing and says so. With CRON_SECRET unset it answers 503, as every other
 * cron route does.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function run(request: NextRequest) {
  const setup = cronSetup(request);
  if (!setup.ok) return setup.response;
  const { admin, origin } = setup;
  const vapid = vapidFromEnv();
  if (!vapid) return NextResponse.json({ skipped: "push_not_configured" }, { headers: NO_STORE });
  try {
    const now = new Date();
    const stopAfter = await configNumber(admin, "reminder_stop_after", DEFAULT_STOP_AFTER);
    const counts = await runDailyPush(await pushDeps(admin, vapid, origin, now, stopAfter));
    if (now.getUTCHours() === 4 && now.getUTCMinutes() < 15) {
      await admin.rpc("prune_push_log");
      await admin.rpc("prune_pairs");
    }
    return NextResponse.json(counts, { headers: NO_STORE });
  } catch (err) {
    console.error("push_daily_failed", err instanceof Error ? err.message.slice(0, 60) : "unknown");
    await reportOps(admin, "cron_failure", "api/push/daily", "failed");
    return NextResponse.json({ error: "failed" }, { status: 500, headers: NO_STORE });
  }
}

export const GET = run;
export const POST = run;
