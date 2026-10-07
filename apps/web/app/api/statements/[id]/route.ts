import { NextResponse, type NextRequest } from "next/server";
import { isUuid } from "@/lib/admin/leads";
import { buildStatementModel, statementCsv, statementFileName, statementPdf, type StatementLine, type StatementRow, type TitleRef } from "@/lib/money/statement";
import { createUserClient } from "@/lib/supabase/server";

/**
 * A monthly statement as PDF or CSV (F-101).
 *
 *   GET /api/statements/<statement id>?format=pdf|csv
 *
 * Generated on request from the closed statement row and its ledger lines,
 * through the caller's own client, so row level security decides who may
 * download: members of the organisation whose role may read statements
 * (owner, finance, author), and platform owner and finance staff (migration
 * 0021). Anyone else gets a 404. A closed statement never changes, because
 * a late line moves to the next open month, so the file is the same every
 * time. No reader is named anywhere in it.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATEMENT_COLUMNS =
  "id, org_id, period, currency, livemode, opening_minor, sales_minor, refunds_minor, pool_minor, adjustments_minor, payouts_minor, closing_minor, units, line_count, is_placeholder_rate, closed_at";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "pdf";
  if (!isUuid(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const supabase = await createUserClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "sign_in" }, { status: 401 });

  const { data: st, error } = await supabase.from("statements").select(STATEMENT_COLUMNS).eq("id", id).maybeSingle();
  if (error) {
    console.error("statement_read_failed", error.code ?? "");
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  if (!st) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const row = st as StatementRow;

  const [orgRes, linesRes] = await Promise.all([
    supabase.from("organisations").select("display_name, code, slug").eq("id", row.org_id).maybeSingle(),
    supabase
      .from("royalty_lines")
      .select("workbook_id, kind, units, gross_minor, tax_minor, fee_minor, net_base_minor, rate, author_minor, note, occurred_at")
      .eq("org_id", row.org_id)
      .eq("period", row.period)
      .eq("currency", row.currency)
      .eq("livemode", row.livemode)
      .order("seq", { ascending: true })
      .limit(20000),
  ]);
  if (orgRes.error || linesRes.error) {
    console.error("statement_parts_failed", orgRes.error?.code ?? linesRes.error?.code ?? "");
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  const lines = (linesRes.data ?? []) as StatementLine[];
  const ids = [...new Set(lines.map((l) => l.workbook_id).filter((x): x is string => Boolean(x)))];
  const titles = new Map<string, TitleRef>();
  if (ids.length) {
    const { data: wbs } = await supabase.from("workbooks").select("id, code, title").in("id", ids);
    for (const w of (wbs ?? []) as { id: string; code: string; title: string }[]) titles.set(w.id, { code: w.code, title: w.title });
  }
  const org = (orgRes.data ?? { display_name: "Organisation", code: null, slug: "organisation" }) as { display_name: string; code: string | null; slug: string };
  const model = buildStatementModel(row, lines, titles, org.display_name);
  const name = statementFileName(org.code ?? org.slug, model, format);

  const headers = {
    "Cache-Control": "private, no-store",
    "Content-Disposition": `attachment; filename="${name}"`,
    "X-Content-Type-Options": "nosniff",
  };
  if (format === "csv") {
    return new NextResponse(statementCsv(model), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
  }
  const pdf = statementPdf(model);
  return new NextResponse(Buffer.from(pdf), { headers: { ...headers, "Content-Type": "application/pdf" } });
}
