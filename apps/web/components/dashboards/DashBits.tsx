import { DASHBOARD_METRICS, METRIC_LABELS, countText, monthLabel, type DashboardCell, type MonthRange } from "@/lib/dashboards";

/**
 * Shared parts of the earnings, dashboard and roll-up pages (F-041, F-042,
 * F-058). Server components only, no client script.
 */

/** Whole months only. A GET form, so the range sits in the link and can be shared. */
export function MonthRangeForm({ action, range, orgId, extra }: { action: string; range: MonthRange; orgId?: string | null; extra?: React.ReactNode }) {
  return (
    <form className="dash-range" action={action} method="get" aria-label="Months to show">
      {orgId ? <input type="hidden" name="org" value={orgId} /> : null}
      <div className="dash-range-field">
        <label htmlFor="dash-from">From</label>
        <input id="dash-from" name="from" type="month" defaultValue={range.from} required />
      </div>
      <div className="dash-range-field">
        <label htmlFor="dash-to">To</label>
        <input id="dash-to" name="to" type="month" defaultValue={range.to} required />
      </div>
      {extra}
      <button type="submit" className="btn secondary">
        Show
      </button>
    </form>
  );
}

export function rangeQuery(range: MonthRange, orgId?: string | null, more: Record<string, string> = {}): string {
  const q = new URLSearchParams({ from: range.from, to: range.to, ...(orgId ? { org: orgId } : {}), ...more });
  return q.toString();
}

/** One table of counts: rows by name, columns by metric. Hidden counts read as text. */
export function CountsTable({
  caption,
  firstHeader,
  rows,
  hidden,
}: {
  caption: string;
  firstHeader: string;
  rows: { key: string; label: React.ReactNode; cells: Record<string, DashboardCell> }[];
  hidden?: string;
}) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table dash-table">
        <caption className="admin-vh">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{firstHeader}</th>
            {DASHBOARD_METRICS.map((m) => (
              <th scope="col" key={m} className="dash-num">
                {METRIC_LABELS[m]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row">{r.label}</th>
              {DASHBOARD_METRICS.map((m) => {
                const c = r.cells[m] ?? { n: null, suppressed: true };
                return (
                  <td key={m} className={c.suppressed ? "dash-num dash-hidden" : "dash-num"}>
                    {countText(c.n, c.suppressed, hidden)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MonthHeading({ month, id }: { month: string; id: string }) {
  return (
    <h3 id={id} className="dash-month">
      {monthLabel(month)}
    </h3>
  );
}

export function DashError({ state }: { state: "denied" | "range" | "failed" }) {
  const text =
    state === "denied"
      ? "Your role in this organisation cannot see this page. Ask an owner if you need it."
      : state === "range"
        ? "Choose whole months, up to 24 of them."
        : "This could not be loaded. Try again in a moment.";
  return (
    <p className={`admin-notice ${state === "denied" ? "admin-notice-ok" : "admin-notice-error"}`} role={state === "denied" ? "status" : "alert"}>
      {text}
    </p>
  );
}

export function CsvLink({ href, label }: { href: string; label: string }) {
  return (
    <p className="dash-csv">
      <a href={href} className="btn secondary" download>
        {label}
      </a>
    </p>
  );
}
