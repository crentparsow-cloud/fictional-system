import type { Metadata } from "next";
import Link from "next/link";
import { formatOrgDate, labelOf, LICENCE_KIND_LABELS } from "@/lib/org-pilot";
import { requireOrgConsole, withOrgParam } from "@/lib/org-pilot-server";
import { groupCountText, monthName, parseReportMonth, REPORT_METRIC_LABELS, reportMonths, type ReportRow } from "@/lib/org-groups";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reports", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

interface Licence {
  id: string;
  kind: string;
  starts_at: string;
  ends_at: string;
}

/**
 * Monthly organisation reports (F-214). Complete months only, counts only.
 * A number under the threshold is never shown, a small group shows
 * nothing, and no row is ever about one person. CSV download alongside.
 */
export default async function OrgReportsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const ctx = await requireOrgConsole("/org/reports", sp.org);
  const canRead = ["owner", "finance", "viewer"].includes(ctx.org.role);
  const month = parseReportMonth(sp.month);
  const supabase = await createUserClient();

  const report = canRead ? await supabase.rpc("org_monthly_report", { p_org: ctx.org.id, p_month: month }) : { data: [], error: null };
  if (report.error) console.error("org_report_failed", report.error.code ?? "");
  const rows = (report.data ?? []) as ReportRow[];
  const licences = ((await supabase.from("org_licences").select("id, kind, starts_at, ends_at").eq("org_id", ctx.org.id)).data ?? []) as Licence[];
  const licenceName = (id: string) => {
    const l = licences.find((x) => x.id === id);
    return l ? `${labelOf(LICENCE_KIND_LABELS, l.kind)} licence, ${formatOrgDate(l.starts_at)} to ${formatOrgDate(l.ends_at)}` : "Licence";
  };
  const byLicence = new Map<string, ReportRow[]>();
  for (const r of rows) byLicence.set(r.licence_id, [...(byLicence.get(r.licence_id) ?? []), r]);
  const csvHref = `/org/reports/csv?month=${month.slice(0, 7)}${ctx.multi ? `&org=${ctx.org.id}` : ""}`;

  return (
    <div className="admin-page studio-page org-console">
      <p className="muted studio-org">{ctx.org.displayName}</p>
      <h1>Reports</h1>
      <section className="card info-privacy" aria-labelledby="rep-privacy-h">
        <h2 id="rep-privacy-h">What these numbers are</h2>
        <p>
          Counts for one complete month. A number under {rows[0]?.threshold ?? 5} is shown as &quot;Fewer than&quot;, and a group with fewer
          members than that shows nothing at all, so no one can be picked out. There are no names and nothing about what anyone wrote.
        </p>
      </section>

      {!canRead ? (
        <p className="admin-note">Your role in {ctx.org.displayName} does not include reports.</p>
      ) : (
        <>
          <form method="get" action="/org/reports" className="admin-form">
            {ctx.multi ? <input type="hidden" name="org" value={ctx.org.id} /> : null}
            <label htmlFor="month">Month</label>
            <select id="month" name="month" defaultValue={month.slice(0, 7)}>
              {reportMonths().map((m) => (
                <option key={m} value={m.slice(0, 7)}>
                  {monthName(m)}
                </option>
              ))}
            </select>
            <button type="submit" className="btn secondary">
              Show
            </button>
          </form>
          <p>
            <a href={csvHref} className="btn secondary" download>
              Download {monthName(month)} as CSV
            </a>
          </p>

          {byLicence.size === 0 ? (
            <div className="card admin-empty">
              <p className="muted">No licence was running in {monthName(month)}.</p>
            </div>
          ) : (
            [...byLicence.entries()].map(([licenceId, lr]) => {
              const groups = new Map<string, ReportRow[]>();
              for (const r of lr.filter((x) => x.scope === "group")) groups.set(r.group_id!, [...(groups.get(r.group_id!) ?? []), r]);
              return (
                <section key={licenceId} className="card" aria-labelledby={`rep-${licenceId}`}>
                  <h2 id={`rep-${licenceId}`}>{licenceName(licenceId)}</h2>
                  <dl className="admin-dl">
                    {lr
                      .filter((r) => r.scope === "licence")
                      .map((r) => (
                        <div key={r.metric}>
                          <dt>{REPORT_METRIC_LABELS[r.metric] ?? r.metric}</dt>
                          <dd>{groupCountText(r.shown, r.value, r.threshold)}</dd>
                        </div>
                      ))}
                  </dl>
                  {[...groups.entries()].map(([gid, gr]) => (
                    <div key={gid} className="admin-table-wrap">
                      <table className="admin-table">
                        <caption>{gr[0]?.group_name}</caption>
                        <tbody>
                          {gr.map((r) => (
                            <tr key={r.metric}>
                              <th scope="row">{REPORT_METRIC_LABELS[r.metric] ?? r.metric}</th>
                              <td>{groupCountText(r.shown, r.value, r.threshold)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </section>
              );
            })
          )}
        </>
      )}
      <p className="muted small">
        <Link href={withOrgParam("/org/groups", ctx.org.id, ctx.multi)}>Groups</Link>
      </p>
    </div>
  );
}
