import type { Metadata } from "next";
import Link from "next/link";
import { formatAdminDate } from "@/lib/admin/leads";
import { adminAbilities } from "@/lib/admin/permissions";
import { SUPPORT_STATUSES, SUPPORT_STATUS_LABELS, SUPPORT_TOPIC_LABELS, parseSupportFilter } from "@/lib/admin/support";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { AdminBack, FilterLink, labelFor } from "../_components/Bits";
import { Notice } from "../_components/Notice";

export const metadata: Metadata = { title: "Support inbox", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

interface Row {
  id: string;
  created_at: string;
  topic: string;
  name: string;
  status: string;
}

/**
 * Support inbox (F-090): messages from the contact form at /contact. Owners,
 * editors and support read them and change status. Replies go from the team
 * inbox, using the saved replies on each message. No reader answers are
 * here or anywhere in admin.
 */
export default async function SupportInboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await getStaffSession("/admin/support");
  const sp = await searchParams;
  const can = adminAbilities(staff.roles);
  if (!can.readSupport) {
    return (
      <div className="admin-page">
        <AdminBack />
        <h1>Support inbox</h1>
        <p className="admin-note">The support inbox is open to owners, editors and support.</p>
      </div>
    );
  }

  const filter = parseSupportFilter(sp.status);
  const supabase = await createUserClient();
  let q = supabase.from("support_messages").select("id, created_at, topic, name, status").order("created_at", { ascending: false }).limit(200);
  if (filter) q = q.eq("status", filter);
  const { data, error } = await q;
  if (error) console.error("admin_support_read_failed", error.code ?? "");
  const rows = (data ?? []) as Row[];

  return (
    <div className="admin-page">
      <AdminBack />
      <h1>Support inbox</h1>
      <p className="muted">Messages from the contact form, newest first. Messages about someone at risk are marked.</p>
      <Notice code={sp.notice} />
      <nav className="admin-filters" aria-label="Filter by status">
        <FilterLink label="All" href="/admin/support" active={!filter} />
        {SUPPORT_STATUSES.map((s) => (
          <FilterLink key={s} label={SUPPORT_STATUS_LABELS[s]} href={`/admin/support?status=${s}`} active={filter === s} />
        ))}
      </nav>

      {error ? (
        <p className="admin-notice admin-notice-error" role="alert">
          Messages could not be loaded. Try again.
        </p>
      ) : rows.length === 0 ? (
        <div className="card admin-empty">
          <h2>No messages</h2>
          <p className="muted">Messages from /contact appear here.</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="admin-vh">Support messages</caption>
            <thead>
              <tr>
                <th scope="col">Received</th>
                <th scope="col">From</th>
                <th scope="col">About</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{formatAdminDate(r.created_at)}</td>
                  <td>
                    <Link href={`/admin/support/${r.id}`}>{r.name}</Link>
                  </td>
                  <td>
                    {r.topic === "worried" ? <span className="badge support-worried">Worried about someone</span> : labelFor(SUPPORT_TOPIC_LABELS, r.topic)}
                  </td>
                  <td>
                    <span className={`badge admin-status admin-status-${r.status}`}>{labelFor(SUPPORT_STATUS_LABELS, r.status)}</span>
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
