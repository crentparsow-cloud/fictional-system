import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorised } from "@/lib/cron-auth";
import { mailOrigin } from "@/lib/org-billing-mail-server";
import { isReportSqlError, sendOrgMonthlyReports } from "@/lib/org-monthly-report-server";
import { reportOps } from "@/lib/ops-alerts";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Monthly report email to organisation owners and finance contacts (0061).
 *
 *   GET or POST /api/org/monthly-report
 *   Authorization: Bearer <CRON_SECRET>   (Vercel Cron sends this itself)
 *   -> { month, organisations, skipped_small, no_contacts, sent, already_sent, failed }
 *
 * Runs on the 2nd of each month for the month before. Counts only, in the
 * email and in this response. Each recipient is claimed per organisation and
 * month, so a second run sends nothing new. With CRON_SECRET unset the route
 * does nothing and says so.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  const origin = mailOrigin(request.headers.get("x-forwarded-host") ?? request.headers.get("host"));
  try {
    const out = await sendOrgMonthlyReports(admin, origin);
    if (out.failed) await reportOps(admin, "email_failure", "api/org/monthly-report", "send_failed");
    return NextResponse.json(out, { headers: NO_STORE });
  } catch (err) {
    const code = isReportSqlError(err) ? (err.code ?? "unknown") : "unknown";
    console.error("org_monthly_report_failed", code);
    await reportOps(admin, "cron_failure", "api/org/monthly-report", code);
    return NextResponse.json({ error: "sql_failed" }, { status: 500, headers: NO_STORE });
  }
}

export const GET = run;
export const POST = run;
