import { NextResponse, type NextRequest } from "next/server";
import { reportOps } from "@/lib/ops-alerts";
import { configNumber, cronSetup, DEFAULT_STOP_AFTER, NO_STORE, reminderDeps, SqlError } from "@/lib/today/jobs";
import { runReminders } from "@/lib/today/run-reminders";

/**
 * Email reminders on the reader's chosen days and time (4.7), and the one
 * email that says they are stopping (14.3).
 *
 *   GET or POST /api/today/reminders
 *   Authorization: Bearer <CRON_SECRET>
 *   -> { considered, not_due, sent, stopped, already_sent, no_step, failed }
 *
 * Meant to run every 15 minutes. Supabase Cron (migration 0040, job
 * akana-today-reminders) does that. A reminder goes from the chosen time for
 * up to three hours after it, on a chosen day, once per reader, programme,
 * step and local date: the mailer claims that key in public.email_claims
 * before it sends. A second run, or the same job from Vercel Cron as well,
 * sends nothing new.
 *
 * After reminder_stop_after (app_config, default 4) reminders in a row with
 * nothing opened or finished in between, the next due moment sends one
 * stopping email and turns the programme's reminders off. Nothing counts
 * days, and no wording mentions anything missed.
 *
 * With CRON_SECRET unset the route does nothing and says so. Addresses and
 * ids are never logged or returned, only counts.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function run(request: NextRequest) {
  const setup = cronSetup(request);
  if (!setup.ok) return setup.response;
  const { admin, origin } = setup;
  try {
    const stopAfter = await configNumber(admin, "reminder_stop_after", DEFAULT_STOP_AFTER);
    const counts = await runReminders(reminderDeps(admin, origin, new Date(), stopAfter));
    if (counts.failed) await reportOps(admin, "email_failure", "api/today/reminders", "send_failed");
    return NextResponse.json(counts, { headers: NO_STORE });
  } catch (err) {
    console.error("today_reminders_failed", err instanceof SqlError ? err.code : "unknown");
    await reportOps(admin, "cron_failure", "api/today/reminders", err instanceof SqlError ? (err.code ?? "sql_failed") : "unknown");
    return NextResponse.json({ error: "failed" }, { status: 500, headers: NO_STORE });
  }
}

export const GET = run;
export const POST = run;
