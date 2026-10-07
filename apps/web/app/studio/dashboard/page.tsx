import type { Metadata } from "next";
import Link from "next/link";
import { CountsTable, CsvLink, DashError, MonthHeading, MonthRangeForm, rangeQuery } from "@/components/dashboards/DashBits";
import { OrgSwitcher } from "@/components/studio/StudioBits";
import { AUTHOR_THRESHOLD, dashboardError, parseMonthRange, pivotDashboard, type DashboardRow } from "@/lib/dashboards";
import { requireStudio } from "@/lib/studio-server";
import { createUserClient } from "@/lib/supabase/server";
import { basisLabel, formatDay } from "@/lib/takedown";

export const metadata: Metadata = { title: "Readers and sales", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

interface TakedownRow {
  takedown_id: string;
  workbook_code: string;
  workbook_title: string;
  notice_reference: string;
  basis: string;
  taken_down_at: string;
  statement_of_reasons: string;
  buyers_keep_access: boolean;
  reinstated_at: string | null;
  counter_notice_open: boolean;
}

/**
 * The privacy-safe dashboard (F-042). Monthly counts per workbook from
 * public.org_dashboard (migration 0022), which hides anything under 10 in
 * the database before it reaches this page. No daily view, no reader, no
 * answer, no check-in and no feeling. Takedowns of the organisation's titles
 * (F-123) are shown here too, with the statement of reasons.
 */
export default async function StudioDashboardPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const ctx = await requireStudio("/studio/dashboard", sp.org);
  const range = parseMonthRange(sp.from, sp.to);
  const orgParam = ctx.multi ? ctx.org.id : null;
  const supabase = await createUserClient();

  const [counts, takedowns] = await Promise.all([
    supabase.rpc("org_dashboard", { p_org: ctx.org.id, p_from: range.fromDay, p_to: range.toDay }),
    supabase.rpc("org_takedowns", { p_org: ctx.org.id }),
  ]);
  if (counts.error) console.error("studio_dashboard_failed", counts.error.code ?? "");
  if (takedowns.error) console.error("studio_takedowns_failed", takedowns.error.code ?? "");
  const months = counts.error ? [] : pivotDashboard((counts.data ?? []) as DashboardRow[]);
  const tds = (takedowns.data ?? []) as TakedownRow[];

  return (
    <div className="admin-page studio-page dash-page">
      <OrgSwitcher ctx={ctx} path="/studio/dashboard" />
      <h1>Readers and sales</h1>
      <p className="dash-lead">
        How your workbooks are doing, month by month. Any count under {AUTHOR_THRESHOLD} shows as &ldquo;Fewer than {AUTHOR_THRESHOLD}&rdquo;, zero
        included, so no reader can be picked out. There is no daily view.
      </p>
      <p className="muted">We never show who readers are, what they wrote, their check-ins or how they felt. Nobody at Akana can read their answers either.</p>
      <p className="muted small">
        Listing views and free weeks only count visitors who have not opted out of counting. Money is on the <Link href={orgParam ? `/studio/earnings?org=${orgParam}` : "/studio/earnings"}>earnings</Link> page.
      </p>

      {tds.length > 0 ? (
        <section className="card dash-takedowns" aria-labelledby="td-h">
          <h2 id="td-h">Titles taken down after a notice</h2>
          <ul className="dash-td-list">
            {tds.map((t) => (
              <li key={t.takedown_id}>
                <p>
                  <strong>{t.workbook_title}</strong> <code>{t.workbook_code}</code>.{" "}
                  {t.reinstated_at ? `Back on sale since ${formatDay(new Date(t.reinstated_at))}.` : `Off sale since ${formatDay(new Date(t.taken_down_at))}.`}{" "}
                  {basisLabel(t.basis)} notice <code>{t.notice_reference}</code>.
                </p>
                {!t.reinstated_at ? (
                  <p className="muted small">
                    {t.counter_notice_open
                      ? "We have your counter-notice and are looking at it."
                      : "If you think this is wrong, you can send a counter-notice with the reference above."}{" "}
                    {!t.counter_notice_open ? <Link href="/takedown/counter">Send a counter-notice</Link> : null}
                  </p>
                ) : null}
                <details>
                  <summary>Statement of reasons</summary>
                  <pre className="dash-statement">{t.statement_of_reasons}</pre>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <MonthRangeForm action="/studio/dashboard" range={range} orgId={orgParam} />

      {counts.error ? (
        <DashError state={dashboardError(counts.error.code)} />
      ) : months.length === 0 || months.every((m) => m.workbooks.length === 0) ? (
        <div className="card admin-empty">
          <h2>Nothing to show yet</h2>
          <p className="muted">Counts appear here once a workbook has been submitted.</p>
        </div>
      ) : (
        <>
          <CsvLink href={`/studio/dashboard/csv?${rangeQuery(range, ctx.org.id)}`} label="Download as CSV" />
          {months.map((m) => (
            <section key={m.month} aria-labelledby={`m-${m.month}`} className="dash-month-block">
              <MonthHeading month={m.month} id={`m-${m.month}`} />
              <CountsTable
                caption={`Counts for ${m.month}`}
                firstHeader="Workbook"
                rows={m.workbooks.map((w) => ({
                  key: w.code,
                  label: (
                    <>
                      {w.title} <code>{w.code}</code>
                    </>
                  ),
                  cells: w.cells,
                }))}
              />
            </section>
          ))}
        </>
      )}
    </div>
  );
}
