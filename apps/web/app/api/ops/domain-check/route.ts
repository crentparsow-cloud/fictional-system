import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorised } from "@/lib/cron-auth";
import { reportOps } from "@/lib/ops-alerts";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDomainChecks } from "@/lib/tenant-domains";

/**
 * Daily custom domain check (migration 0033).
 *
 *   GET or POST /api/ops/domain-check
 *   Authorization: Bearer <CRON_SECRET>   (Vercel Cron sends this itself)
 *   -> { checked, ok, failed, inconclusive, stopped, errors, skipped }
 *
 * Looks up the _akana-verify TXT record of every white-label host over
 * Cloudflare DNS-over-HTTPS and records each result through
 * public.record_tenant_domain_check_job (service role only). A verified host
 * that fails 3 checks in a row stops resolving; that raises an ops alert so
 * staff can tell the tenant. A lookup with no answer is never a failure.
 * With CRON_SECRET unset the route does nothing and says so.
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

  const summary = await runDomainChecks(admin);
  if ("error" in summary) {
    console.error("domain_check_failed", summary.error);
    await reportOps(admin, "cron_failure", "api/ops/domain-check", summary.error);
    return NextResponse.json({ error: "sql_failed" }, { status: 500, headers: NO_STORE });
  }
  if (summary.errors > 0) await reportOps(admin, "cron_failure", "api/ops/domain-check", "record_failed");
  // Host names stay out of the alert; staff see which host stopped on the tenant page and in the audit log.
  if (summary.stopped.length > 0) await reportOps(admin, "error", "api/ops/domain-check", "domain_stopped");
  return NextResponse.json({ ...summary, stopped: summary.stopped.length }, { headers: NO_STORE });
}

export const GET = run;
export const POST = run;
