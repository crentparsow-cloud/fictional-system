import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GENRE_LABELS, INTEREST_LABELS, KIND_LABELS } from "@/app/publish/options";
import { formatAdminDate, isUuid, LEAD_STATUS_LABELS, leadStatusTargets, mailtoHref } from "@/lib/admin/leads";
import { adminAbilities } from "@/lib/admin/permissions";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { AdminBack, LeadStatusBadge, labelFor } from "../../_components/Bits";
import { Notice } from "../../_components/Notice";
import { setLeadStatus } from "../actions";

export const metadata: Metadata = { title: "Lead", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

interface LeadDetail {
  id: string;
  created_at: string;
  kind: string;
  name: string;
  email: string;
  organisation: string | null;
  country: string | null;
  catalogue_size: string | null;
  book_title: string | null;
  book_ref: string | null;
  genre: string | null;
  interest: string | null;
  message: string | null;
  source: string;
  status: string;
}

/** One lead with its message and the status change (F-001). No hashes are read. */
export default async function AdminLeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const staff = await getStaffSession(`/admin/leads`);
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const can = adminAbilities(staff.roles);
  if (!can.readLeads) notFound();

  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("leads")
    .select("id, created_at, kind, name, email, organisation, country, catalogue_size, book_title, book_ref, genre, interest, message, source, status")
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("admin_lead_read_failed", error.code ?? "");
  if (!data) notFound();
  const lead = data as LeadDetail;
  const mail = mailtoHref(lead.email);

  const rows: [string, string][] = [
    ["Received", formatAdminDate(lead.created_at)],
    ["Kind", labelFor(KIND_LABELS, lead.kind)],
    ["Organisation", lead.organisation ?? ""],
    ["Country", lead.country ?? ""],
    ["Catalogue size", lead.catalogue_size ?? ""],
    ["Book title", lead.book_title ?? ""],
    ["Book link or ISBN", lead.book_ref ?? ""],
    ["Genre", labelFor(GENRE_LABELS, lead.genre)],
    ["Interest", labelFor(INTEREST_LABELS, lead.interest)],
    ["Source", lead.source],
  ];

  return (
    <div className="admin-page">
      <AdminBack href="/admin/leads" label="All leads" />
      <h1>{lead.name}</h1>
      <p>
        {mail ? <a href={mail}>{lead.email}</a> : lead.email} <LeadStatusBadge status={lead.status} />
      </p>
      <Notice code={sp.notice} />

      <dl className="admin-dl card">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>

      <h2>Message</h2>
      {lead.message ? <p className="card admin-message">{lead.message}</p> : <p className="muted">No message was left.</p>}

      {can.updateLeads ? (
        <section aria-labelledby="lead-status-h">
          <h2 id="lead-status-h">Change status</h2>
          <p className="muted">Each change is written to the audit log.</p>
          <div className="admin-actions">
            {leadStatusTargets(lead.status).map((s) => (
              <form key={s} action={setLeadStatus}>
                <input type="hidden" name="id" value={lead.id} />
                <input type="hidden" name="status" value={s} />
                <button type="submit" className="btn secondary">
                  Mark as {LEAD_STATUS_LABELS[s].toLowerCase()}
                </button>
              </form>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
