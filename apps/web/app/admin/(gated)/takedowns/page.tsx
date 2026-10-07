import type { Metadata } from "next";
import Link from "next/link";
import { dashAbilities } from "@/lib/account-lookup";
import { getStaffSession } from "@/lib/staff";
import { NOTICE_KIND_LABELS, NOTICE_STATUS_LABELS, basisLabel, formatDay } from "@/lib/takedown";
import { AdminBack, FilterLink, labelFor } from "../_components/Bits";
import { readQueue } from "./queue";
import { TakedownNotice } from "./TakedownNotice";

export const metadata: Metadata = { title: "Notices and takedowns", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

/**
 * The notice and takedown queue (F-123). Owners, editors and support read
 * it. Open notices come first. The repeat infringer flag marks an
 * organisation with several active takedowns in the last 12 months
 * (app_config.takedown_repeat_threshold) for a person to review.
 */
export default async function AdminTakedownsPage({ searchParams }: { searchParams: Search }) {
  const staff = await getStaffSession("/admin/takedowns");
  const sp = await searchParams;
  const can = dashAbilities(staff.roles);
  if (!can.readTakedowns) {
    return (
      <div className="admin-page">
        <AdminBack />
        <h1>Notices and takedowns</h1>
        <p className="admin-note">Notices are open to owners, editors and support.</p>
      </div>
    );
  }
  const filter = (Array.isArray(sp.show) ? sp.show[0] : sp.show) === "all" ? "all" : "open";
  const { rows, error } = await readQueue();
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === "received" || r.status === "reviewing");

  return (
    <div className="admin-page">
      <AdminBack />
      <h1>Notices and takedowns</h1>
      <p className="muted">
        Copyright and other notices from the public form at <Link href="/takedown">/takedown</Link>, and counter-notices. Taking a title down pauses it
        through the kill switch and takes it out of the membership.
      </p>
      <TakedownNotice code={sp.notice} />
      <p className="admin-filters">
        <FilterLink label="Open" href="/admin/takedowns" active={filter === "open"} /> <FilterLink label="All" href="/admin/takedowns?show=all" active={filter === "all"} />
      </p>
      {error ? (
        <p className="admin-notice admin-notice-error" role="alert">
          The queue could not be loaded. Try again.
        </p>
      ) : shown.length === 0 ? (
        <div className="card admin-empty">
          <h2>{filter === "open" ? "No open notices" : "No notices yet"}</h2>
          <p className="muted">New notices appear here as soon as they are sent.</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="admin-vh">Notices</caption>
            <thead>
              <tr>
                <th scope="col">Reference</th>
                <th scope="col">Received</th>
                <th scope="col">Type</th>
                <th scope="col">Workbook</th>
                <th scope="col">Organisation</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/admin/takedowns/${r.id}`}>
                      <code>{r.reference}</code>
                    </Link>
                  </td>
                  <td>{formatDay(new Date(r.created_at))}</td>
                  <td>
                    {labelFor(NOTICE_KIND_LABELS, r.kind)}, {basisLabel(r.basis)}
                  </td>
                  <td>{r.workbook_code ? <code>{r.workbook_code}</code> : <span className="muted">Not matched</span>}</td>
                  <td>
                    {r.org_name ?? ""}
                    {r.repeat_infringer ? <span className="badge td-repeat"> Repeat</span> : null}
                  </td>
                  <td>
                    <span className={`badge admin-status td-status-${r.status}`}>{labelFor(NOTICE_STATUS_LABELS, r.status)}</span>
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
