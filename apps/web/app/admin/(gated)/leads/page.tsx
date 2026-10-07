import type { Metadata } from "next";
import Link from "next/link";
import { GENRE_LABELS, INTEREST_LABELS, KIND_LABELS } from "@/app/publish/options";
import { formatAdminDate, LEAD_STATUS_LABELS, LEAD_STATUSES, mailtoHref, parseLeadStatusFilter } from "@/lib/admin/leads";
import { adminAbilities } from "@/lib/admin/permissions";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { AdminBack, FilterLink, LeadStatusBadge, labelFor } from "../_components/Bits";
import { Notice } from "../_components/Notice";

export const metadata: Metadata = { title: "Leads", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

interface LeadRow {
  id: string;
  created_at: string;
  kind: string;
  name: string;
  email: string;
  organisation: string | null;
  book_title: string | null;
  genre: string | null;
  interest: string | null;
  status: string;
}

const LIMIT = 200;

/** Enquiries from /publish, newest first (F-001). Read through RLS: owner, editor and support. */
export default async function AdminLeadsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const staff = await getStaffSession("/admin/leads");
  const sp = await searchParams;
  const filter = parseLeadStatusFilter(sp.status);
  const can = adminAbilities(staff.roles);

  if (!can.readLeads) {
    return (
      <div className="admin-page">
        <AdminBack />
        <h1>Leads</h1>
        <p className="admin-note">Leads are open to the owner, editor and support roles. Your role cannot see them.</p>
      </div>
    );
  }

  const supabase = await createUserClient();
  let query = supabase
    .from("leads")
    .select("id, created_at, kind, name, email, organisation, book_title, genre, interest, status")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (filter) query = query.eq("status", filter);
  const { data, error } = await query;
  if (error) console.error("admin_leads_read_failed", error.code ?? "");
  const leads = (data ?? []) as LeadRow[];

  return (
    <div className="admin-page">
      <AdminBack />
      <h1>Leads</h1>
      <p className="muted">Enquiries from the Publish with Akana page, newest first.</p>
      <Notice code={sp.notice} />

      <nav className="admin-filters" aria-label="Filter by status">
        <FilterLink label="All" href="/admin/leads" active={filter === null} />
        {LEAD_STATUSES.map((s) => (
          <FilterLink key={s} label={LEAD_STATUS_LABELS[s]} href={`/admin/leads?status=${s}`} active={filter === s} />
        ))}
      </nav>

      {error ? (
        <p className="admin-notice admin-notice-error" role="alert">
          Leads could not be loaded. Try again.
        </p>
      ) : leads.length === 0 ? (
        <div className="card admin-empty">
          <h2>{filter ? `No ${LEAD_STATUS_LABELS[filter].toLowerCase()} leads` : "No leads yet"}</h2>
          <p className="muted">
            {filter ? "Try another status." : "Enquiries from the Publish with Akana page will appear here."}
          </p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="admin-vh">Leads{filter ? `, ${LEAD_STATUS_LABELS[filter]}` : ""}</caption>
            <thead>
              <tr>
                <th scope="col">Received</th>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Kind</th>
                <th scope="col">Organisation</th>
                <th scope="col">Book</th>
                <th scope="col">Genre</th>
                <th scope="col">Interest</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => {
                const mail = mailtoHref(l.email);
                return (
                  <tr key={l.id}>
                    <td>{formatAdminDate(l.created_at)}</td>
                    <td>
                      <Link href={`/admin/leads/${l.id}`}>{l.name}</Link>
                    </td>
                    <td>{mail ? <a href={mail}>{l.email}</a> : l.email}</td>
                    <td>{labelFor(KIND_LABELS, l.kind)}</td>
                    <td>{l.organisation ?? ""}</td>
                    <td>{l.book_title ?? ""}</td>
                    <td>{labelFor(GENRE_LABELS, l.genre)}</td>
                    <td>{labelFor(INTEREST_LABELS, l.interest)}</td>
                    <td>
                      <LeadStatusBadge status={l.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {leads.length === LIMIT ? <p className="muted">Showing the newest {LIMIT}.</p> : null}
        </div>
      )}
    </div>
  );
}
