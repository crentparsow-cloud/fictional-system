import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorised } from "@/lib/cron-auth";
import { reportOps } from "@/lib/ops-alerts";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Daily retention sweep (F-141, F-142).
 *
 *   GET or POST /api/ops/sweep
 *   Authorization: Bearer <CRON_SECRET>   (Vercel Cron sends this itself)
 *   -> { funnel_pruned, visitors_pruned, ops_pruned, rate_pruned, orgs_offboarded }
 *
 * Deletes funnel counts older than 13 months (public.prune_funnel_counts),
 * daily visitor hashes older than yesterday (public.prune_funnel_visitors, 0036),
 * ops events older than 90 days (public.prune_ops_events) and rate limit
 * counts older than a day (public.prune_rate_hits, 0027), and offboards
 * organisations whose licences all ended 30 days ago (public.org_offboard_sweep,
 * 0030: roster and admin details deleted, members keep their work). A failure is
 * itself reported as a cron failure, which opens an alert and sends one
 * email. With CRON_SECRET unset the route does nothing and says so.
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

  const funnel = await admin.rpc("prune_funnel_counts");
  const visitors = await admin.rpc("prune_funnel_visitors");
  const ops = await admin.rpc("prune_ops_events");
  const rate = await admin.rpc("prune_rate_hits");
  // F-228 (0030): roster and admin details of organisations 30 days after their last licence ended.
  const offboard = await admin.rpc("org_offboard_sweep");
  const failed = funnel.error ?? visitors.error ?? ops.error ?? rate.error ?? offboard.error;
  if (failed) {
    console.error("ops_sweep_failed", failed.code ?? "unknown");
    await reportOps(admin, "cron_failure", "api/ops/sweep", failed.code ?? "unknown");
    return NextResponse.json({ error: "sql_failed" }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ funnel_pruned: Number(funnel.data ?? 0), visitors_pruned: Number(visitors.data ?? 0), ops_pruned: Number(ops.data ?? 0), rate_pruned: Number(rate.data ?? 0), orgs_offboarded: Number(offboard.data ?? 0) }, { headers: NO_STORE });
}

export const GET = run;
export const POST = run;
