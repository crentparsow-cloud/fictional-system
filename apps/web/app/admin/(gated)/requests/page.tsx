import type { Metadata } from "next";
import { formatAdminDate } from "@/lib/admin/leads";
import { adminAbilities } from "@/lib/admin/permissions";
import { groupRequests, parseRequestFilter, REQUEST_STATUSES, REQUEST_STATUS_LABELS, type RequestRow } from "@/lib/admin/title-requests";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { AdminBack, FilterLink } from "../_components/Bits";
import { Notice } from "../_components/Notice";
import { setRequestGroupStatus } from "./actions";

export const metadata: Metadata = { title: "Title requests", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Title requests (build list 2.8): what readers and visitors have asked us to
 * add, with the same title grouped together and the most asked first. Owners,
 * editors and support read them and set a status and a short note. The form
 * stores no name and no email, so there is nobody to reply to from here.
 */
export default async function TitleRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await getStaffSession("/admin/requests");
  const sp = await searchParams;
  const can = adminAbilities(staff.roles);
  if (!can.readSupport) {
    return (
      <div className="admin-page">
        <AdminBack />
        <h1>Title requests</h1>
        <p className="admin-note">Title requests are open to owners, editors and support.</p>
      </div>
    );
  }

  const filter = parseRequestFilter(sp.status);
  const supabase = await createUserClient();
  let q = supabase
    .from("title_requests")
    .select("id, created_at, title, title_key, author_name, note, status, staff_note")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (filter) q = q.eq("status", filter);
  const { data, error } = await q;
  if (error) console.error("admin_title_requests_read_failed", error.code ?? "");
  const groups = groupRequests((data ?? []) as RequestRow[]);

  return (
    <div className="admin-page">
      <AdminBack />
      <h1>Title requests</h1>
      <p className="muted">Titles people have asked for, most asked first. The same title in different wording is counted together.</p>
      <Notice code={sp.notice} />
      <nav className="admin-filters" aria-label="Filter by status">
        <FilterLink label="All" href="/admin/requests" active={!filter} />
        {REQUEST_STATUSES.map((s) => (
          <FilterLink key={s} label={REQUEST_STATUS_LABELS[s]} href={`/admin/requests?status=${s}`} active={filter === s} />
        ))}
      </nav>

      {error ? (
        <p className="admin-notice admin-notice-error" role="alert">
          Requests could not be loaded. Try again.
        </p>
      ) : groups.length === 0 ? (
        <div className="card admin-empty">
          <h2>No requests</h2>
          <p className="muted">Requests from /request-title appear here.</p>
        </div>
      ) : (
        <ul className="studio-list">
          {groups.map((g) => (
            <li key={g.key} className="card">
              <h2>{g.title}</h2>
              <p className="muted">
                Asked for {g.count} {g.count === 1 ? "time" : "times"}. Latest {formatAdminDate(g.latest)}.{" "}
                {g.authors.length ? `Author: ${g.authors.slice(0, 3).join(", ")}.` : "No author given."}{" "}
                <span className={`badge admin-status admin-status-${g.status}`}>{g.status === "mixed" ? "Mixed" : REQUEST_STATUS_LABELS[g.status]}</span>
              </p>
              {g.notes.length ? (
                <ul className="studio-plain">
                  {g.notes.map((n, i) => (
                    <li key={i} className="admin-message">
                      {n}
                    </li>
                  ))}
                </ul>
              ) : null}
              {g.staffNote ? <p className="admin-note">Staff note: {g.staffNote}</p> : null}
              {can.updateSupport ? (
                <form action={setRequestGroupStatus} className="admin-form">
                  {g.ids.slice(0, 200).map((id) => (
                    <input key={id} type="hidden" name="id" value={id} />
                  ))}
                  <label htmlFor={`st-${g.key}`}>Status</label>
                  <select id={`st-${g.key}`} name="status" defaultValue={g.status === "mixed" ? "new" : g.status}>
                    {REQUEST_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {REQUEST_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <label htmlFor={`nt-${g.key}`}>Staff note (optional)</label>
                  <input id={`nt-${g.key}`} name="note" type="text" maxLength={500} defaultValue={g.staffNote ?? ""} />
                  <div className="admin-actions">
                    <button type="submit" className="btn secondary">
                      Save
                    </button>
                  </div>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
