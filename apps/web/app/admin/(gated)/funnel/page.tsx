import type { Metadata } from "next";
import { FUNNEL_EVENTS, FUNNEL_LABELS, RANGES, SUPPRESS_BELOW, dayRange, parseRange, summarise, suppressed, type SummaryRow } from "@/lib/admin/funnel";
import { adminAbilities } from "@/lib/admin/permissions";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { AdminBack, FilterLink } from "../_components/Bits";

export const metadata: Metadata = { title: "Funnel", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const RANGE_LABELS: Record<keyof typeof RANGES, string> = { "7": "7 days", "30": "30 days", "90": "90 days", "395": "13 months" };

/**
 * First-party funnel counts (F-141). Daily counts only: no people, no
 * sessions, no answers. Totals are exact. Per workbook, counts under
 * SUPPRESS_BELOW are shown as "fewer than", the same rule author dashboards
 * will use. Purchases here are an indication; the purchases table is the
 * record for money.
 */
export default async function FunnelPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await getStaffSession("/admin/funnel");
  const sp = await searchParams;
  const can = adminAbilities(staff.roles);

  if (!can.readFunnel) {
    return (
      <div className="admin-page">
        <AdminBack />
        <h1>Funnel</h1>
        <p className="admin-note">Funnel counts are open to owners, editors and finance.</p>
      </div>
    );
  }

  const range = parseRange(sp.range);
  const { from, to } = dayRange(RANGES[range]);
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("funnel_summary", { p_from: from, p_to: to });
  if (error) console.error("admin_funnel_failed", error.code ?? "");
  const table = summarise((data ?? []) as SummaryRow[]);

  return (
    <div className="admin-page">
      <AdminBack />
      <h1>Funnel</h1>
      <p className="muted">
        Counted on Akana&apos;s own servers. Nothing is sent to a third party, and visitors who turn counting off, or whose browser asks not to be tracked,
        are not counted.
      </p>
      <nav className="admin-filters" aria-label="Date range">
        {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((k) => (
          <FilterLink key={k} label={RANGE_LABELS[k]} href={`/admin/funnel?range=${k}`} active={k === range} />
        ))}
      </nav>
      <p className="muted small">
        {from} to {to}, UTC days.
      </p>

      {error ? (
        <p className="admin-notice admin-notice-error" role="alert">
          Counts could not be loaded. Try again.
        </p>
      ) : (
        <>
          <h2>All titles</h2>
          <ul className="funnel-totals">
            {FUNNEL_EVENTS.map((e) => (
              <li key={e} className="card">
                <span className="funnel-n">{table.totals[e].toLocaleString("en-GB")}</span>
                <span className="muted">{FUNNEL_LABELS[e]}</span>
              </li>
            ))}
          </ul>

          <h2>By workbook</h2>
          <p className="muted small">Counts under {SUPPRESS_BELOW} are not shown, to protect readers on small titles.</p>
          {table.byWorkbook.length === 0 ? (
            <div className="card admin-empty">
              <p>No workbook events in this range.</p>
            </div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <caption className="admin-vh">Events by workbook</caption>
                <thead>
                  <tr>
                    <th scope="col">Code</th>
                    {FUNNEL_EVENTS.map((e) => (
                      <th key={e} scope="col">
                        {FUNNEL_LABELS[e]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.byWorkbook.map((r) => (
                    <tr key={r.code}>
                      <td>
                        <code>{r.code}</code>
                      </td>
                      {FUNNEL_EVENTS.map((e) => (
                        <td key={e}>{suppressed(r.counts[e])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
