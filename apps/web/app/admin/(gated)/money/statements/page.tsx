import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatMinor, isPeriod, periodLabel } from "@/lib/money/format";
import { moneyAbilities } from "@/lib/money/permissions";
import { isTestKey } from "@/lib/money/reconcile";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { AdminBack } from "../../_components/Bits";
import { closeDueMonths } from "../actions";
import { ModeBanner, MoneyNav, MoneyNotice } from "../MoneyBits";

export const metadata: Metadata = { title: "Statements", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

interface StatementListRow {
  id: string;
  org_id: string;
  period: string;
  currency: string;
  sales_minor: number;
  refunds_minor: number;
  pool_minor: number;
  payouts_minor: number;
  closing_minor: number;
  units: number;
  is_placeholder_rate: boolean;
}

/**
 * Monthly statements (F-101), newest month first. Each downloads as PDF or
 * CSV from /api/statements/<id>, the same link organisations use. Owner and
 * finance staff only.
 */
export default async function StatementsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await getStaffSession("/admin/money/statements");
  const can = moneyAbilities(staff.roles);
  if (!can.read) notFound();
  const sp = await searchParams;
  const period = isPeriod(sp.period) ? sp.period : null;
  const livemode = !isTestKey(process.env.STRIPE_SECRET_KEY);
  const supabase = await createUserClient();

  let q = supabase
    .from("statements")
    .select("id, org_id, period, currency, sales_minor, refunds_minor, pool_minor, payouts_minor, closing_minor, units, is_placeholder_rate")
    .eq("livemode", livemode)
    .order("period", { ascending: false })
    .limit(200);
  if (period) q = q.eq("period", period);
  const { data, error } = await q;
  if (error) console.error("money_statements_read_failed", error.code ?? "");
  const rows = (data ?? []) as StatementListRow[];

  const orgIds = [...new Set(rows.map((r) => r.org_id))];
  const names = new Map<string, string>();
  if (orgIds.length) {
    const { data: orgs } = await supabase.from("organisations").select("id, display_name").in("id", orgIds);
    for (const o of (orgs ?? []) as { id: string; display_name: string }[]) names.set(o.id, o.display_name);
  }

  return (
    <div className="admin-page money-page">
      <AdminBack href="/admin/money" label="Money" />
      <h1>Statements</h1>
      <MoneyNav current="/admin/money/statements" />
      <MoneyNotice code={sp.notice} />
      <ModeBanner livemode={livemode} placeholder={rows.some((r) => r.is_placeholder_rate)} />
      <p className="muted">
        A statement is written when its month closes, after the refund window. It never changes: anything later goes on the next one.
      </p>

      <form className="admin-search" method="get">
        <label htmlFor="st-period">Month</label>
        <div className="admin-search-row">
          <input id="st-period" name="period" type="month" defaultValue={period ?? ""} />
          <button type="submit" className="btn secondary">
            Show
          </button>
        </div>
      </form>

      {can.runPayouts ? (
        <form action={closeDueMonths} className="admin-actions">
          <input type="hidden" name="back" value="statements" />
          <button type="submit" className="btn secondary">
            Close due months now
          </button>
        </form>
      ) : null}

      {error ? <p className="admin-notice admin-notice-error">Statements could not be loaded. Try again.</p> : null}
      {rows.length === 0 ? (
        <div className="card admin-empty">
          <p>No statements {period ? `for ${periodLabel(period)}` : "yet"}.</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="admin-vh">Statements</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Organisation</th>
                <th scope="col">Units</th>
                <th scope="col">Sales</th>
                <th scope="col">Refunds</th>
                <th scope="col">Pool</th>
                <th scope="col">Carried forward</th>
                <th scope="col">Files</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {periodLabel(r.period)}
                    {r.is_placeholder_rate ? <span className="badge money-provisional">Provisional</span> : null}
                  </td>
                  <td>{names.get(r.org_id) ?? r.org_id.slice(0, 8)}</td>
                  <td>{r.units}</td>
                  <td>{formatMinor(r.sales_minor, r.currency)}</td>
                  <td>{formatMinor(r.refunds_minor, r.currency)}</td>
                  <td>{formatMinor(r.pool_minor, r.currency)}</td>
                  <td>{formatMinor(r.closing_minor, r.currency)}</td>
                  <td className="money-files">
                    <a href={`/api/statements/${r.id}?format=pdf`}>PDF</a> <a href={`/api/statements/${r.id}?format=csv`}>CSV</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
