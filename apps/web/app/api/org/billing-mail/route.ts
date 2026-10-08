import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorised } from "@/lib/cron-auth";
import { isSqlError, mailOrigin, sendOrgBillingMail, sendOrgTermsReminders } from "@/lib/org-billing-mail-server";
import { reportOps } from "@/lib/ops-alerts";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Organisation billing mail, daily (0031).
 *
 *   GET or POST /api/org/billing-mail
 *   Authorization: Bearer <CRON_SECRET>   (Vercel Cron sends this itself)
 *   -> { billing: {...counts}, reminders: {...counts} }
 *
 * 1. Queues invoices that passed their due date, then sends every pending
 *    billing email (invoice sent, payment failed or overdue, licence
 *    suspended, ending, ended) to the owner and finance contacts, once per
 *    event and person (email_claims). The webhook sends most of these
 *    within seconds; this run catches the rest.
 * 2. Sends the DMCC reminder notices to consumer organisers: monthly plans
 *    every six months before a payment, yearly plans before each renewal.
 *
 * With CRON_SECRET unset the route does nothing and says so. Counts only.
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
    const billing = await sendOrgBillingMail(admin, origin);
    const reminders = await sendOrgTermsReminders(admin, origin);
    if (billing.failed || reminders.failed) await reportOps(admin, "email_failure", "api/org/billing-mail", "send_failed");
    return NextResponse.json({ billing, reminders }, { headers: NO_STORE });
  } catch (err) {
    const code = isSqlError(err) ? (err.code ?? "unknown") : "unknown";
    console.error("org_billing_mail_failed", code);
    await reportOps(admin, "cron_failure", "api/org/billing-mail", code);
    return NextResponse.json({ error: "sql_failed" }, { status: 500, headers: NO_STORE });
  }
}

export const GET = run;
export const POST = run;
