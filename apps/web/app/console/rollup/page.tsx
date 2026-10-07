import type { Metadata } from "next";
import { CountsTable, CsvLink, DashError, MonthRangeForm, rangeQuery } from "@/components/dashboards/DashBits";
import { OrgSwitcher } from "@/components/studio/StudioBits";
import {
  AUTHOR_THRESHOLD,
  HIDDEN_TOTAL_TEXT,
  dashboardError,
  money,
  monthLabel,
  parseMonthRange,
  pivotRollup,
  type RollupEarningsRow,
  type RollupRow,
} from "@/lib/dashboards";
import { requireStudio } from "@/lib/studio-server";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Roll-up", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Publisher roll-up (F-058): readers, sales and earnings across the
 * organisation's authors, filterable by imprint and author, with CSV.
 * Counts come from public.publisher_rollup_counts (migration 0022), which
 * hides a total when it is under 10 or when any workbook inside it is
 * between 1 and 9, so totals cannot be used to work out a hidden count.
 * Money comes from the 0021 ledger and is exact.
 */
export default async function ConsoleRollupPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const ctx = await requireStudio("/console/rollup", sp.org);
  const range = parseMonthRange(sp.from, sp.to);
  const orgParam = ctx.multi ? ctx.org.id : null;
  const supabase = await createUserClient();

  const filters = await supabase.rpc("publisher_rollup_filters", { p_org: ctx.org.id });
  if (filters.error) console.error("rollup_filters_failed", filters.error.code ?? "");
  const options = (filters.data ?? []) as { kind: string; id: string; name: string }[];
  const imprints = options.filter((o) => o.kind === "imprint");
  const authors = options.filter((o) => o.kind === "author");
  const imprintRaw = one(sp.imprint);
  const authorRaw = one(sp.author);
  const imprint = imprintRaw && UUID.test(imprintRaw) && imprints.some((i) => i.id === imprintRaw) ? imprintRaw : null;
  const author = authorRaw && UUID.test(authorRaw) && authors.some((a) => a.id === authorRaw) ? authorRaw : null;

  const [counts, earnings] = await Promise.all([
    supabase.rpc("publisher_rollup_counts", { p_org: ctx.org.id, p_from: range.fromDay, p_to: range.toDay, p_imprint: imprint }),
    supabase.rpc("publisher_rollup_earnings", { p_org: ctx.org.id, p_from: range.fromDay, p_to: range.toDay, p_imprint: imprint }),
  ]);
  if (counts.error) console.error("rollup_counts_failed", counts.error.code ?? "");
  if (earnings.error && earnings.error.code !== "AKD01") console.error("rollup_earnings_failed", earnings.error.code ?? "");

  const months = counts.error ? [] : pivotRollup((counts.data ?? []) as RollupRow[], author);
  const money_ = (earnings.data ?? []) as RollupEarningsRow[];
  const moneyRows = money_.filter((r) => (author ? r.scope === "author" && r.author_id === author : true));
  const more: Record<string, string> = { ...(imprint ? { imprint } : {}), ...(author ? { author } : {}) };

  const filterFields = (
    <>
      {imprints.length > 0 ? (
        <div className="dash-range-field">
          <label htmlFor="dash-imprint">Imprint</label>
          <select id="dash-imprint" name="imprint" defaultValue={imprint ?? ""}>
            <option value="">All imprints</option>
            {imprints.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {authors.length > 0 ? (
        <div className="dash-range-field">
          <label htmlFor="dash-author">Author</label>
          <select id="dash-author" name="author" defaultValue={author ?? ""}>
            <option value="">All authors</option>
            {authors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </>
  );

  return (
    <div className="admin-page studio-page dash-page">
      <OrgSwitcher ctx={ctx} path="/console/rollup" />
      <h1>Roll-up across your authors</h1>
      <p className="dash-lead">
        Counts and earnings for every author in {ctx.org.displayName}, month by month. A count under {AUTHOR_THRESHOLD} shows as &ldquo;Fewer than{" "}
        {AUTHOR_THRESHOLD}&rdquo;. A total also shows as &ldquo;{HIDDEN_TOTAL_TEXT}&rdquo; when one of its workbooks has a small count, so nobody can work
        it out by subtraction.
      </p>
      <p className="muted small">
        A book with two authors counts under each of them, so author rows can add up to more than the total. Subscription earnings show once each
        month&rsquo;s membership pool closes.
      </p>

      {counts.error ? (
        <DashError state={dashboardError(counts.error.code)} />
      ) : (
        <>
          <MonthRangeForm action="/console/rollup" range={range} orgId={orgParam} extra={filterFields} />

          <h2>Readers and sales</h2>
          {months.length === 0 ? (
            <p className="muted">Nothing to show for these months.</p>
          ) : (
            <>
              <CsvLink href={`/console/rollup/csv?${rangeQuery(range, ctx.org.id, { ...more, kind: "counts" })}`} label="Download counts as CSV" />
              {months.map((m) => (
                <section key={m.month} className="dash-month-block" aria-labelledby={`rm-${m.month}`}>
                  <h3 id={`rm-${m.month}`} className="dash-month">
                    {monthLabel(m.month)}
                  </h3>
                  <CountsTable
                    caption={`Roll-up counts for ${m.month}`}
                    firstHeader="Author"
                    hidden={HIDDEN_TOTAL_TEXT}
                    rows={m.rows.map((r) => ({
                      key: r.key,
                      label: (
                        <>
                          {r.scope === "total" ? <strong>{r.name}</strong> : r.name}{" "}
                          <span className="muted small">
                            {r.workbooks} {r.workbooks === 1 ? "workbook" : "workbooks"}
                          </span>
                        </>
                      ),
                      cells: r.cells,
                    }))}
                  />
                </section>
              ))}
            </>
          )}

          <h2>Earnings</h2>
          {earnings.error ? (
            <p className="muted">{earnings.error.code === "AKD01" ? "Earnings are open to owners and finance in your organisation." : "Earnings could not be loaded. Try again."}</p>
          ) : moneyRows.length === 0 ? (
            <p className="muted">No ledger lines in these months.</p>
          ) : (
            <>
              <CsvLink href={`/console/rollup/csv?${rangeQuery(range, ctx.org.id, { ...more, kind: "earnings" })}`} label="Download earnings as CSV" />
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <caption className="admin-vh">Earnings by author and month</caption>
                  <thead>
                    <tr>
                      <th scope="col">Month</th>
                      <th scope="col">Author</th>
                      <th scope="col" className="dash-num">
                        Units
                      </th>
                      <th scope="col" className="dash-num">
                        Share
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {moneyRows.map((r) => (
                      <tr key={`${r.period}-${r.scope}-${r.author_id ?? "all"}-${r.currency}-${r.livemode}`}>
                        <td>
                          {monthLabel(r.period)} {r.livemode ? null : <span className="badge demo">Test</span>}
                        </td>
                        <th scope="row">{r.scope === "total" ? <strong>{r.author_name}</strong> : r.author_name}</th>
                        <td className="dash-num">{Number(r.units).toLocaleString("en-GB")}</td>
                        <td className="dash-num">
                          {money(r.author_minor, r.currency)}
                          {r.has_placeholder_rate ? <span className="muted small"> provisional</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
