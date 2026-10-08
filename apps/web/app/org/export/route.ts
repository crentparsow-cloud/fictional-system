import { NextResponse, type NextRequest } from "next/server";
import { getReaderSession } from "@/lib/auth";
import { csvResponse } from "@/lib/dashboards-server";
import { invoicesCsv, rosterCsv, seatSummaryCsv, type InvoiceRow, type RosterRow, type SeatSummaryRow } from "@/lib/org-billing";
import { getCustomerMemberships } from "@/lib/org-pilot-server";
import { createUserClient } from "@/lib/supabase/server";

/**
 * The organisation's records as CSV (F-228).
 *
 *   GET /org/export?kind=roster|seats|invoices[&org=<id>]
 *
 * roster    app.org_roster_export: the address invited (or the work address
 *           a domain link recorded), when each seat was taken and released.
 *           After a licence ends the addresses come from the archive 0030
 *           keeps until the offboarding sweep deletes it.
 * seats     app.org_seat_summary: counts per licence, suppressed as on /org.
 * invoices  org_invoices through RLS (owner and finance).
 * Every read runs as the signed-in person, so the 0030 and 0024 functions
 * and RLS decide. Nothing here reaches answers, progress or check-ins.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const session = await getReaderSession();
  if (!session) return NextResponse.json({ error: "sign_in" }, { status: 401 });
  const orgs = await getCustomerMemberships(session.userId);
  const wanted = request.nextUrl.searchParams.get("org");
  const org = (wanted && UUID.test(wanted) ? orgs.find((o) => o.id === wanted) : orgs[0]) ?? null;
  if (!org) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const kind = request.nextUrl.searchParams.get("kind");
  const supabase = await createUserClient();
  const stamp = new Date().toISOString().slice(0, 10);

  if (kind === "roster") {
    const { data, error } = await supabase.rpc("org_roster_export", { p_org: org.id });
    if (error) return failed(error.code);
    return csvResponse(rosterCsv((data ?? []) as RosterRow[]), `akana-roster-${stamp}.csv`);
  }
  if (kind === "seats") {
    const { data, error } = await supabase.rpc("org_seat_summary", { p_org: org.id });
    if (error) return failed(error.code);
    return csvResponse(seatSummaryCsv((data ?? []) as SeatSummaryRow[]), `akana-seats-${stamp}.csv`);
  }
  if (kind === "invoices") {
    if (org.role !== "owner" && org.role !== "finance") return NextResponse.json({ error: "not_found" }, { status: 404 });
    const { data, error } = await supabase
      .from("org_invoices")
      .select("number, status, currency, amount_due_minor, amount_paid_minor, tax_minor, po_number, period_start, period_end, due_at, paid_at, livemode")
      .eq("org_id", org.id)
      .order("created_at", { ascending: true });
    if (error) return failed(error.code);
    return csvResponse(invoicesCsv((data ?? []) as InvoiceRow[]), `akana-invoices-${stamp}.csv`);
  }
  return NextResponse.json({ error: "unknown_kind" }, { status: 400 });
}

function failed(code: string | undefined) {
  if (code === "AKO01") return NextResponse.json({ error: "not_found" }, { status: 404 });
  console.error("org_export_failed", code ?? "");
  return NextResponse.json({ error: "failed" }, { status: 500 });
}
