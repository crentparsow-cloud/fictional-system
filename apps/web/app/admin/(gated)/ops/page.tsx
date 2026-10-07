import type { Metadata } from "next";
import { formatAdminDate } from "@/lib/admin/leads";
import { OPS_KINDS, OPS_THRESHOLDS, daysAgoIso, opsKindLabel } from "@/lib/admin/ops";
import { adminAbilities } from "@/lib/admin/permissions";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { AdminBack } from "../_components/Bits";
import { Notice } from "../_components/Notice";
import { acknowledgeAlert } from "./actions";

export const metadata: Metadata = { title: "Alerts", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

interface AlertRow {
  id: string;
  kind: string;
  source: string;
  opened_at: string;
  last_at: string;
  event_count: number;
  last_code: string | null;
  notified_at: string | null;
  acknowledged_at: string | null;
}

interface EventRow {
  kind: string;
  source: string;
  code: string | null;
  at: string;
}

/**
 * Operational alerts (F-142): webhook, scheduled job, payout and validator
 * failures, email failures above a threshold and error spikes. Any staff
 * role reads; owners, editors and support acknowledge. Events carry a kind,
 * a route and a short code, never a message or a form value.
 */
export default async function OpsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await getStaffSession("/admin/ops");
  const sp = await searchParams;
  const can = adminAbilities(staff.roles);
  const supabase = await createUserClient();

  const since = daysAgoIso(7);
  const [alertsRes, eventsRes] = await Promise.all([
    supabase
      .from("ops_alerts")
      .select("id, kind, source, opened_at, last_at, event_count, last_code, notified_at, acknowledged_at")
      .order("opened_at", { ascending: false })
      .limit(100),
    supabase.from("ops_events").select("kind, source, code, at").gte("at", since).order("at", { ascending: false }).limit(200),
  ]);
  if (alertsRes.error) console.error("admin_ops_alerts_failed", alertsRes.error.code ?? "");
  if (eventsRes.error) console.error("admin_ops_events_failed", eventsRes.error.code ?? "");
  const alerts = (alertsRes.data ?? []) as AlertRow[];
  const open = alerts.filter((a) => !a.acknowledged_at);
  const closed = alerts.filter((a) => a.acknowledged_at).slice(0, 20);
  const events = (eventsRes.data ?? []) as EventRow[];

  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);

  return (
    <div className="admin-page">
      <AdminBack />
      <h1>Alerts</h1>
      <p className="muted">
        One email goes to the operator when an alert opens. Later failures of the same kind add to its count until someone acknowledges it.
      </p>
      <Notice code={sp.notice} />

      {alertsRes.error ? (
        <p className="admin-notice admin-notice-error" role="alert">
          Alerts could not be loaded. Try again.
        </p>
      ) : null}

      <h2>Open</h2>
      {open.length === 0 ? (
        <div className="card admin-empty">
          <p>Nothing open. All quiet.</p>
        </div>
      ) : (
        <ul className="review-list">
          {open.map((a) => (
            <li key={a.id} className="card ops-alert">
              <h3>{opsKindLabel(a.kind)}</h3>
              <p>
                <code>{a.source}</code>
                {a.last_code ? (
                  <>
                    {" "}
                    code <code>{a.last_code}</code>
                  </>
                ) : null}
              </p>
              <p className="muted">
                Opened {formatAdminDate(a.opened_at)}. {a.event_count} event{a.event_count === 1 ? "" : "s"}, the last {formatAdminDate(a.last_at)}.{" "}
                {a.notified_at ? "Emailed." : "Not emailed: check OPS_ALERT_TO or LEADS_NOTIFY_TO."}
              </p>
              {can.acknowledgeOps ? (
                <form action={acknowledgeAlert}>
                  <input type="hidden" name="alert" value={a.id} />
                  <button type="submit" className="btn secondary">
                    Acknowledge
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <h2>Last 7 days</h2>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <caption className="admin-vh">Events in the last 7 days by kind</caption>
          <thead>
            <tr>
              <th scope="col">Kind</th>
              <th scope="col">Events</th>
              <th scope="col">When it alerts</th>
            </tr>
          </thead>
          <tbody>
            {OPS_KINDS.map((k) => (
              <tr key={k}>
                <td>{opsKindLabel(k)}</td>
                <td>{counts.get(k) ?? 0}</td>
                <td className="muted">{OPS_THRESHOLDS[k]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {closed.length ? (
        <>
          <h2>Recently acknowledged</h2>
          <ul className="review-list">
            {closed.map((a) => (
              <li key={a.id}>
                {opsKindLabel(a.kind)} on <code>{a.source}</code>, {a.event_count} event{a.event_count === 1 ? "" : "s"}, acknowledged{" "}
                {formatAdminDate(a.acknowledged_at)}.
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
