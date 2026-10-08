import type { Metadata } from "next";
import Link from "next/link";
import { CsvLink, DashError, MonthRangeForm, rangeQuery } from "@/components/dashboards/DashBits";
import { OrgSwitcher } from "@/components/studio/StudioBits";
import { dashboardError, groupEarnings, money, monthLabel, parseMonthRange, rateText, type EarningsRow } from "@/lib/dashboards";
import { requireStudio } from "@/lib/studio-server";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Earnings", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

interface BalanceRow {
  currency: string;
  livemode: boolean;
  balance_minor: number;
  payable_minor: number;
  pending_payout_minor: number;
  last_closed_period: string | null;
  has_placeholder_rate: boolean;
}

interface StatementRow {
  id: string;
  period: string;
  currency: string;
  livemode: boolean;
  closing_minor: number;
  sales_minor: number;
  refunds_minor: number;
  pool_minor: number;
  payouts_minor: number;
  units: number;
  is_placeholder_rate: boolean;
}

/**
 * Earnings and statements (F-041). Money comes from the royalty ledger
 * (migration 0021): per workbook and month through public.org_earnings
 * (0022, which reads the royalty_title_months view), and balances and closed
 * statements straight from 0021's tables under its own RLS (owner, finance
 * and author members). Exact amounts, never a reader's identity. The demo
 * organisation reads 0029's demo tables instead, labelled Demo throughout.
 */
export default async function StudioEarningsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const ctx = await requireStudio("/studio/earnings", sp.org);
  const range = parseMonthRange(sp.from, sp.to);
  const orgParam = ctx.multi ? ctx.org.id : null;
  const supabase = await createUserClient();

  // A demo organisation (Quillmoor Demo Press) reads its demo money from
  // migration 0029's separate demo tables; org_earnings already switches.
  const demo = ctx.org.isDemo;
  const [earnings, balances, statements] = await Promise.all([
    supabase.rpc("org_earnings", { p_org: ctx.org.id, p_from: range.fromDay, p_to: range.toDay }),
    supabase
      .from(demo ? "demo_royalty_balances" : "royalty_balances")
      .select("currency, livemode, balance_minor, payable_minor, pending_payout_minor, last_closed_period, has_placeholder_rate")
      .eq("org_id", ctx.org.id),
    supabase
      .from(demo ? "demo_statements" : "statements")
      .select("id, period, currency, livemode, closing_minor, sales_minor, refunds_minor, pool_minor, payouts_minor, units, is_placeholder_rate")
      .eq("org_id", ctx.org.id)
      .order("period", { ascending: false })
      .limit(36),
  ]);
  if (earnings.error) console.error("studio_earnings_failed", earnings.error.code ?? "");
  if (balances.error) console.error("studio_balances_failed", balances.error.code ?? "");
  if (statements.error) console.error("studio_statements_failed", statements.error.code ?? "");

  const groups = earnings.error ? [] : groupEarnings((earnings.data ?? []) as EarningsRow[]);
  const bal = ((balances.data ?? []) as BalanceRow[]).sort((a, b) => Number(b.livemode) - Number(a.livemode) || a.currency.localeCompare(b.currency));
  const stmts = (statements.data ?? []) as StatementRow[];
  const provisional = groups.some((g) => g.provisional) || bal.some((b) => b.has_placeholder_rate);

  return (
    <div className="admin-page studio-page dash-page">
      <OrgSwitcher ctx={ctx} path="/studio/earnings" />
      <h1>Earnings</h1>

      {earnings.error && dashboardError(earnings.error.code) === "denied" ? (
        <DashError state="denied" />
      ) : (
        <>
          <section className="card dash-method" aria-labelledby="method-h">
            <h2 id="method-h">How we work it out</h2>
            <p>
              For each sale we start with what the reader paid. We take off VAT, and the card fee where your licence says so. What is left is the net
              receipt. Your share is the net receipt times the rate in your licence.
            </p>
            <p>
              If a reader gets a refund, your share of that sale comes off the next statement. Membership money is shared each month across the workbooks
              members used, by how many steps they completed, up to a cap.
            </p>
            <p className="muted small">
              We never show who bought or read a workbook. A month closes 14 days after it ends, so late refunds can land. Then it gets a statement.
            </p>
          </section>

          {demo ? (
            <p className="studio-draft" role="note">
              <strong>Demo.</strong> These are invented test-mode figures for the Quillmoor demo. No reader paid, no money moved, and none of it is on a
              real statement or payout. Resetting the demo rebuilds them.
            </p>
          ) : null}

          {provisional ? (
            <p className="studio-draft" role="note">
              <strong>Provisional.</strong> The rates behind these figures are placeholders until Akana sets them. Nothing here is paid out at these rates.
            </p>
          ) : null}

          <h2>Balance</h2>
          {bal.length === 0 ? (
            <p className="muted">No earnings yet.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <caption className="admin-vh">Balance by currency</caption>
                <thead>
                  <tr>
                    <th scope="col">Currency</th>
                    <th scope="col" className="dash-num">
                      Earned, not yet paid
                    </th>
                    <th scope="col" className="dash-num">
                      Ready to pay
                    </th>
                    <th scope="col" className="dash-num">
                      Payout on its way
                    </th>
                    <th scope="col">Last closed month</th>
                  </tr>
                </thead>
                <tbody>
                  {bal.map((b) => (
                    <tr key={`${b.currency}-${b.livemode}`}>
                      <th scope="row">
                        {b.currency} {demo ? <span className="badge demo">Demo</span> : b.livemode ? null : <span className="badge demo">Test</span>}
                      </th>
                      <td className="dash-num">{money(b.balance_minor, b.currency)}</td>
                      <td className="dash-num">{money(b.payable_minor, b.currency)}</td>
                      <td className="dash-num">{money(b.pending_payout_minor, b.currency)}</td>
                      <td>{b.last_closed_period ? monthLabel(b.last_closed_period) : "None yet"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted small">
            Payouts go to the bank account on your <Link href="/payouts">payouts</Link> page.
          </p>

          <h2>Statements</h2>
          {stmts.length === 0 ? (
            <p className="muted">Your first statement appears after your first month with sales closes.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <caption className="admin-vh">Monthly statements</caption>
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    <th scope="col" className="dash-num">
                      Sales
                    </th>
                    <th scope="col" className="dash-num">
                      Refunds
                    </th>
                    <th scope="col" className="dash-num">
                      Membership
                    </th>
                    <th scope="col" className="dash-num">
                      Paid out
                    </th>
                    <th scope="col" className="dash-num">
                      Closing balance
                    </th>
                    <th scope="col">Download</th>
                  </tr>
                </thead>
                <tbody>
                  {stmts.map((s) => (
                    <tr key={s.id}>
                      <th scope="row">
                        {monthLabel(s.period)} {s.currency} {demo ? <span className="badge demo">Demo</span> : s.livemode ? null : <span className="badge demo">Test</span>}
                        {s.is_placeholder_rate ? <span className="muted small"> Provisional</span> : null}
                      </th>
                      <td className="dash-num">{money(s.sales_minor, s.currency)}</td>
                      <td className="dash-num">{money(s.refunds_minor, s.currency)}</td>
                      <td className="dash-num">{money(s.pool_minor, s.currency)}</td>
                      <td className="dash-num">{money(s.payouts_minor, s.currency)}</td>
                      <td className="dash-num">{money(s.closing_minor, s.currency)}</td>
                      <td>
                        <a href={`/api/statements/${s.id}?format=pdf`} download>
                          PDF
                        </a>{" "}
                        <a href={`/api/statements/${s.id}?format=csv`} download>
                          CSV
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2>By workbook and month</h2>
          <MonthRangeForm action="/studio/earnings" range={range} orgId={orgParam} />
          {earnings.error ? (
            <DashError state={dashboardError(earnings.error.code)} />
          ) : groups.length === 0 ? (
            <p className="muted">No ledger lines in these months.</p>
          ) : (
            <>
              <CsvLink href={`/studio/earnings/csv?${rangeQuery(range, ctx.org.id)}`} label="Download as CSV" />
              {groups.map((g) => (
                <section key={`${g.month}-${g.currency}-${g.livemode}`} className="dash-month-block" aria-label={`${monthLabel(g.month)} ${g.currency}`}>
                  <h3 className="dash-month">
                    {monthLabel(g.month)} <span className="muted">{g.currency}</span>{" "}
                    {demo ? <span className="badge demo">Demo</span> : g.livemode ? null : <span className="badge demo">Test</span>}
                  </h3>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <caption className="admin-vh">
                        Earnings for {g.month} in {g.currency}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Workbook</th>
                          <th scope="col" className="dash-num">
                            Sold
                          </th>
                          <th scope="col" className="dash-num">
                            Paid by readers
                          </th>
                          <th scope="col" className="dash-num">
                            Rate
                          </th>
                          <th scope="col" className="dash-num">
                            Sales share
                          </th>
                          <th scope="col" className="dash-num">
                            Refunds
                          </th>
                          <th scope="col" className="dash-num">
                            Membership
                          </th>
                          <th scope="col" className="dash-num">
                            Your share
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((r) => (
                          <tr key={`${r.workbook_id}-${r.currency}`}>
                            <th scope="row">
                              {r.workbook_title ?? "Workbook"} {r.workbook_code ? <code>{r.workbook_code}</code> : null}
                            </th>
                            <td className="dash-num">{Number(r.units).toLocaleString("en-GB")}</td>
                            <td className="dash-num">{money(r.gross_minor, r.currency)}</td>
                            <td className="dash-num">{rateText(r.sale_rate)}</td>
                            <td className="dash-num">{money(r.sales_author_minor, r.currency)}</td>
                            <td className="dash-num">{money(r.refunds_author_minor, r.currency)}</td>
                            <td className="dash-num">{money(r.pool_author_minor, r.currency)}</td>
                            <td className="dash-num">
                              <strong>{money(r.author_minor, r.currency)}</strong>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th scope="row" colSpan={7}>
                            Total
                          </th>
                          <td className="dash-num">
                            <strong>{money(g.total, g.currency)}</strong>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </section>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
