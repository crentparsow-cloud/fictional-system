import { NextResponse, type NextRequest } from "next/server";
import { getReaderSession } from "@/lib/auth";
import { dashboardError, fileSlug, parseMonthRange, rollupCsv, rollupEarningsCsv, type RollupEarningsRow, type RollupRow } from "@/lib/dashboards";
import { csvResponse, pickOrg } from "@/lib/dashboards-server";
import { getMemberships } from "@/lib/studio-server";
import { createUserClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** CSV of the publisher roll-up (F-058): ?kind=counts (suppressed as on the page) or ?kind=earnings (exact). */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const session = await getReaderSession();
  if (!session) return NextResponse.json({ error: "sign_in" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const org = pickOrg(await getMemberships(session.userId), q.get("org"));
  if (!org) return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const range = parseMonthRange(q.get("from") ?? undefined, q.get("to") ?? undefined);
  const imprintRaw = q.get("imprint");
  const imprint = imprintRaw && UUID.test(imprintRaw) ? imprintRaw : null;
  const authorRaw = q.get("author");
  const author = authorRaw && UUID.test(authorRaw) ? authorRaw : null;
  const kind = q.get("kind") === "earnings" ? "earnings" : "counts";

  const supabase = await createUserClient();
  const fn = kind === "earnings" ? "publisher_rollup_earnings" : "publisher_rollup_counts";
  const { data, error } = await supabase.rpc(fn, { p_org: org.id, p_from: range.fromDay, p_to: range.toDay, p_imprint: imprint });
  if (error) {
    console.error("rollup_csv_failed", error.code ?? "");
    const state = dashboardError(error.code);
    return NextResponse.json({ error: state }, { status: state === "denied" ? 403 : state === "range" ? 400 : 500, headers: { "Cache-Control": "no-store" } });
  }
  const name = `akana-rollup-${kind}-${fileSlug(org.displayName)}-${range.from}-to-${range.to}.csv`;
  if (kind === "earnings") {
    const rows = ((data ?? []) as RollupEarningsRow[]).filter((r) => (author ? r.scope === "author" && r.author_id === author : true));
    return csvResponse(rollupEarningsCsv(rows), name);
  }
  const rows = ((data ?? []) as RollupRow[]).filter((r) => (author ? r.scope === "author" && r.author_id === author : true));
  return csvResponse(rollupCsv(rows), name);
}
