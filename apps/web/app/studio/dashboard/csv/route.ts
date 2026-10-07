import { NextResponse, type NextRequest } from "next/server";
import { getReaderSession } from "@/lib/auth";
import { dashboardCsv, dashboardError, fileSlug, parseMonthRange, type DashboardRow } from "@/lib/dashboards";
import { csvResponse, pickOrg } from "@/lib/dashboards-server";
import { getMemberships } from "@/lib/studio-server";
import { createUserClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** CSV of the privacy-safe dashboard (F-042). The same suppressed rows as the page. */
export async function GET(request: NextRequest) {
  const session = await getReaderSession();
  if (!session) return NextResponse.json({ error: "sign_in" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const org = pickOrg(await getMemberships(session.userId), request.nextUrl.searchParams.get("org"));
  if (!org) return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const range = parseMonthRange(request.nextUrl.searchParams.get("from") ?? undefined, request.nextUrl.searchParams.get("to") ?? undefined);

  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("org_dashboard", { p_org: org.id, p_from: range.fromDay, p_to: range.toDay });
  if (error) {
    console.error("studio_dashboard_csv_failed", error.code ?? "");
    const state = dashboardError(error.code);
    return NextResponse.json({ error: state }, { status: state === "denied" ? 403 : state === "range" ? 400 : 500, headers: { "Cache-Control": "no-store" } });
  }
  return csvResponse(dashboardCsv((data ?? []) as DashboardRow[]), `akana-readers-${fileSlug(org.displayName)}-${range.from}-to-${range.to}.csv`);
}
