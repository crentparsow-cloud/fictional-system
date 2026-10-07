import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorised } from "@/lib/cron-auth";
import { reportOps } from "@/lib/ops-alerts";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Nightly demo reset (F-045, F-074).
 *
 *   GET or POST /api/ops/demo-reset
 *   Authorization: Bearer <CRON_SECRET>   (Vercel Cron sends this itself)
 *   -> { look, workbooks, listed, members, retired, publisher_login, author_login }
 *
 * Calls public.reset_demo_state_job (migration 0023, service role only),
 * which puts the demo publisher, its site and its logins back to the start
 * and keeps the last chosen look. Creates no accounts. A failure is reported
 * as a cron failure. With CRON_SECRET unset the route does nothing and says so.
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

  const { data, error } = await admin.rpc("reset_demo_state_job");
  if (error) {
    console.error("demo_reset_failed", error.code ?? "unknown");
    await reportOps(admin, "cron_failure", "api/ops/demo-reset", error.code ?? "unknown");
    return NextResponse.json({ error: "sql_failed" }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json(data ?? {}, { headers: NO_STORE });
}

export const GET = run;
export const POST = run;
