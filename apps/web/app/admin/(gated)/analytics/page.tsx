import type { Metadata } from "next";
import {
  BRACKETS,
  type FunnelRow,
  MEMBERSHIP_LABELS,
  MEMBERSHIP_METRICS,
  type MembershipRow,
  type RetentionRow,
  SUPPRESS_BELOW,
  cohortTable,
  dropOffByUnit,
  funnelSteps,
  membershipMetrics,
  parseWeeks,
} from "@/lib/admin/analytics";
import { RANGES, dayRange, parseRange } from "@/lib/admin/funnel";
import { adminAbilities } from "@/lib/admin/permissions";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { AdminBack, FilterLink } from "../_components/Bits";

export const metadata: Metadata = { title: "Analytics", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const RANGE_LABELS: Record<keyof typeof RANGES, string> = { "7": "7 days", "30": "30 days", "90": "90 days", "395": "13 months" };
const COHORT_WEEKS = 8;

/**
 * First-party analytics (build list 10.4 and 13.20). Counts from Akana's own
 * servers: the funnel from a workbook page view to a completed checkout,
 * where readers stop inside a workbook, finished steps per week by cohort of
 * first purchase week, and the two membership cancel measures. No person is
 * shown. Visitors are told apart for one day by a hash that rotates daily
 * (lib/visitor-id.ts). Anything per workbook or per cohort is suppressed
 * under SUPPRESS_BELOW. Opens to the roles /admin/funnel opens to.
 */
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await getStaffSession("/admin/analytics");
  const sp = await searchParams;
  const can = adminAbilities(staff.roles);

  if (!can.readFunnel) {
    return (
      <div className="admin-page">
        <AdminBack />
        <h1>Analytics</h1>
        <p className="admin-note">Analytics are open to owners, editors and finance.</p>
      </div>
    );
  }

  const range = parseRange(sp.range);
  const weeks = parseWeeks(sp.weeks);
  const { from, to } = dayRange(RANGES[range]);
  const supabase = await createUserClient();
  const [funnel, retention, membership] = await Promise.all([
    supabase.rpc("analytics_funnel", { p_from: from, p_to: to }),
    supabase.rpc("analytics_retention", { p_weeks: weeks }),
    supabase.rpc("analytics_membership", { p_from: from, p_to: to }),
  ]);
  const error = funnel.error ?? retention.error ?? membership.error;
  if (error) console.error("admin_analytics_failed", error.code ?? "");

  const funnelRows = (funnel.data ?? []) as FunnelRow[];
  const steps = funnelSteps(funnelRows);
  const dropOff = dropOffByUnit(funnelRows);
  const cohorts = cohortTable((retention.data ?? []) as RetentionRow[], COHORT_WEEKS);
  const members = membershipMetrics((membership.data ?? []) as MembershipRow[]);

  return (
    <div className="admin-page">
      <AdminBack />
      <h1>Analytics</h1>
      <p className="muted">
        Counted on Akana&apos;s own servers. Visitors are told apart for one day only, by a hash that changes daily and is never shown. Nothing
        is sent to a third party, and visitors who turn counting off, or whose browser asks not to be tracked, are not counted.
      </p>
      <nav className="admin-filters" aria-label="Date range">
        {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((k) => (
          <FilterLink key={k} label={RANGE_LABELS[k]} href={`/admin/analytics?range=${k}&weeks=${weeks}`} active={k === range} />
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
          <h2>Funnel</h2>
          <p className="muted small">Each step: events, then distinct daily visitors and their share of the first step. Site-wide, exact.</p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <caption className="admin-vh">Funnel from workbook page view to completed checkout</caption>
              <thead>
                <tr>
                  <th scope="col">Step</th>
                  <th scope="col">Events</th>
                  <th scope="col">Visitors</th>
                  <th scope="col">Of first step</th>
                </tr>
              </thead>
              <tbody>
                {steps.map((s) => (
                  <tr key={s.event}>
                    <th scope="row">{s.label}</th>
                    <td>{s.n.toLocaleString("en-GB")}</td>
                    <td>{s.uniques.toLocaleString("en-GB")}</td>
                    <td>{s.shareOfFirst === null ? "" : `${s.shareOfFirst}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Where readers stop</h2>
          <p className="muted small">
            Fields answered against steps finished, per unit. A unit with many fields answered and few steps finished is where readers stop. Counts
            under {SUPPRESS_BELOW} are not shown.
          </p>
          {dropOff.length === 0 ? (
            <div className="card admin-empty">
              <p>No unit counts in this range.</p>
            </div>
          ) : (
            dropOff.map((wb) => (
              <div className="admin-table-wrap" key={wb.code}>
                <table className="admin-table">
                  <caption>
                    <code>{wb.code}</code>
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Unit</th>
                      <th scope="col">Fields answered</th>
                      <th scope="col">Steps finished</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wb.units.map((u) => (
                      <tr key={u.unit}>
                        <th scope="row">{u.unit}</th>
                        <td>{u.fieldsAnswered}</td>
                        <td>{u.stepsFinished}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}

          <h2>Finished steps per week, by cohort</h2>
          <p className="muted small">
            A cohort is the week (Monday, UTC) of a reader&apos;s first paid purchase. Week 1 is that week. A cohort of fewer than {SUPPRESS_BELOW}{" "}
            readers shows nothing.
          </p>
          <nav className="admin-filters" aria-label="Cohort weeks">
            {[8, 13, 26, 52].map((w) => (
              <FilterLink key={w} label={`${w} weeks`} href={`/admin/analytics?range=${range}&weeks=${w}`} active={w === weeks} />
            ))}
          </nav>
          {cohorts.length === 0 ? (
            <div className="card admin-empty">
              <p>No purchase cohorts in the last {weeks} weeks.</p>
            </div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <caption className="admin-vh">Finished steps per week by cohort of first purchase week</caption>
                <thead>
                  <tr>
                    <th scope="col">Cohort week</th>
                    <th scope="col">Readers</th>
                    {Array.from({ length: COHORT_WEEKS }, (_, i) => (
                      <th key={i} scope="col">
                        Wk {i + 1}
                      </th>
                    ))}
                    {BRACKETS.map((b) => (
                      <th key={b.key} scope="col">
                        {b.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map((c) => (
                    <tr key={c.cohortWeek}>
                      <th scope="row">{c.cohortWeek}</th>
                      <td>{c.size}</td>
                      {c.weeks.map((w, i) => (
                        <td key={i}>{w}</td>
                      ))}
                      {BRACKETS.map((b) => (
                        <td key={b.key}>{c.brackets[b.key]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2>Membership</h2>
          <p className="muted small">By the day the cancel was asked for. Site-wide, exact.</p>
          <ul className="funnel-totals">
            {MEMBERSHIP_METRICS.map((m) => (
              <li key={m} className="card">
                <span className="funnel-n">{members[m].toLocaleString("en-GB")}</span>
                <span className="muted">{MEMBERSHIP_LABELS[m]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
