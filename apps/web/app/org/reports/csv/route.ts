import { NextResponse, type NextRequest } from "next/server";
import { csvResponse } from "@/lib/dashboards-server";
import { labelOf, LICENCE_KIND_LABELS } from "@/lib/org-pilot";
import { getCustomerMemberships } from "@/lib/org-pilot-server";
import { getReaderSession } from "@/lib/auth";
import { isUuidLike, parseReportMonth, reportCsv, type ReportRow } from "@/lib/org-groups";
import { createUserClient } from "@/lib/supabase/server";

/**
 * A month's organisation report as CSV (F-214).
 *
 *   GET /org/reports/csv?month=yyyy-mm[&org=<id>]
 *
 * The same counts as /org/reports, from app.org_monthly_report, which checks
 * the caller's role and suppresses small numbers. No names, no per-person rows.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getReaderSession();
  if (!session) return NextResponse.json({ error: "sign_in" }, { status: 401 });
  const orgs = await getCustomerMemberships(session.userId);
  const wanted = request.nextUrl.searchParams.get("org");
  const org = (wanted && isUuidLike(wanted) ? orgs.find((o) => o.id === wanted) : orgs[0]) ?? null;
  if (!org) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const month = parseReportMonth(request.nextUrl.searchParams.get("month") ?? undefined);

  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("org_monthly_report", { p_org: org.id, p_month: month });
  if (error) {
    if (error.code === "AKG01") return NextResponse.json({ error: "not_found" }, { status: 404 });
    console.error("org_report_csv_failed", error.code ?? "");
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  const { data: lic } = await supabase.from("org_licences").select("id, kind, starts_at").eq("org_id", org.id);
  const licences = (lic ?? []) as { id: string; kind: string; starts_at: string }[];
  const label = (id: string) => {
    const l = licences.find((x) => x.id === id);
    return l ? `${labelOf(LICENCE_KIND_LABELS, l.kind)} licence from ${l.starts_at.slice(0, 10)}` : "Licence";
  };
  return csvResponse(reportCsv((data ?? []) as ReportRow[], month, label), `akana-report-${month.slice(0, 7)}.csv`);
}
