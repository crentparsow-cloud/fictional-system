import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrgNoticeLine } from "@/components/org/OrgShell";
import { adminAbilities } from "@/lib/admin/permissions";
import {
  CUSTOMER_KIND_LABELS,
  defaultLicenceDates,
  formatOrgDate,
  isCustomerKind,
  isoToDateInput,
  labelOf,
  LICENCE_KIND_LABELS,
  LICENCE_KINDS,
  LICENCE_STATUS_LABELS,
  SIZE_BAND_LABELS,
  SIZE_BANDS,
  startedText,
  TITLE_SCOPE_LABELS,
  TITLE_SCOPES,
} from "@/lib/org-pilot";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { AdminBack } from "../../_components/Bits";
import { createLicence, inviteCustomerAdmin, saveCustomerProfile, setLicenceTitles, updateLicence } from "../actions";

export const metadata: Metadata = { title: "Customer", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

interface Org {
  id: string;
  kind: string;
  display_name: string;
  legal_name: string;
  country: string | null;
  status: string;
}
interface Profile {
  size_band: string | null;
  sector: string | null;
  charity_number: string | null;
  vat_number: string | null;
  billing_name: string | null;
  billing_email: string | null;
  billing_country: string | null;
}
interface Licence {
  id: string;
  kind: string;
  title_scope: string;
  seats_purchased: number;
  starts_at: string;
  ends_at: string;
  status: string;
  manual_invoice_ref: string | null;
  org_licence_titles: { workbook_id: string }[] | null;
}
interface Summary {
  licence_id: string;
  seats_claimed: number;
  invitations_open: number;
  people_started: number | null;
  started_shown: string;
  threshold: number;
}
interface Title {
  id: string;
  code: string;
  title: string;
  in_membership: boolean;
}
interface Member {
  email: string;
  role: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One customer organisation (F-201, F-202): the profile, the person who
 * runs it, and its licences with the same suppressed counts the
 * organisation sees. Staff see no more about members than the organisation
 * does: the counts come from the same function, and no admin page reads a
 * member's progress or answers.
 */
export default async function AdminCustomerPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const staff = await getStaffSession(`/admin/business/${id}`);
  const sp = await searchParams;
  const can = adminAbilities(staff.roles);
  const write = can.createOrganisations;
  const supabase = await createUserClient();

  const { data: orgData } = await supabase.from("organisations").select("id, kind, display_name, legal_name, country, status").eq("id", id).maybeSingle();
  const org = orgData as Org | null;
  if (!org || !isCustomerKind(org.kind)) notFound();

  const [profileRes, licencesRes, summaryRes, titlesRes, rosterRes] = await Promise.all([
    supabase.from("org_profiles").select("size_band, sector, charity_number, vat_number, billing_name, billing_email, billing_country").eq("org_id", id).maybeSingle(),
    supabase
      .from("org_licences")
      .select("id, kind, title_scope, seats_purchased, starts_at, ends_at, status, manual_invoice_ref, org_licence_titles(workbook_id)")
      .eq("org_id", id)
      .order("starts_at", { ascending: false }),
    supabase.rpc("org_seat_summary", { p_org: id }),
    supabase
      .from("workbooks")
      .select("id, code, title, in_membership")
      .eq("status", "live")
      .eq("is_demo", false)
      .neq("safety_tier", "higher")
      .eq("tenant_id", "00000000-0000-0000-0000-00000000000a")
      .order("title")
      .limit(500),
    supabase.rpc("org_roster", { p_org: id }),
  ]);
  const profile = (profileRes.data ?? null) as Profile | null;
  const licences = (licencesRes.data ?? []) as Licence[];
  const summaries = new Map(((summaryRes.data ?? []) as Summary[]).map((s) => [s.licence_id, s]));
  const titles = (titlesRes.data ?? []) as Title[];
  const titleName = new Map(titles.map((t) => [t.id, `${t.title} (${t.code})`]));
  const members = (rosterRes.data ?? []) as Member[];

  const dates = defaultLicenceDates();

  return (
    <div className="admin-page">
      <AdminBack href="/admin/business" label="Customers" />
      <h1>{org.display_name}</h1>
      <p className="muted">
        {labelOf(CUSTOMER_KIND_LABELS, org.kind)}. {org.legal_name}
        {org.country ? `, ${org.country}` : ""}. Status: {org.status}.
      </p>
      <OrgNoticeLine code={sp.notice} />

      <section className="card" aria-labelledby="people-h">
        <h2 id="people-h">People who run it</h2>
        {members.length === 0 ? (
          <p className="muted">Nobody yet. Invite the person who will invite their people and see the counts.</p>
        ) : (
          <ul>
            {members.map((m) => (
              <li key={`${m.email}-${m.role}`}>
                {m.email}, {m.role}
              </li>
            ))}
          </ul>
        )}
        {write ? (
          <form className="admin-form" action={inviteCustomerAdmin}>
            <input type="hidden" name="org" value={org.id} />
            <label htmlFor="admin-email">Invite an owner by email</label>
            <input id="admin-email" name="email" type="email" maxLength={254} required autoComplete="off" />
            <p className="muted small">The link works once, for that address only, for 14 days. The email names the organisation and no workbook.</p>
            <button type="submit" className="btn">
              Send invitation
            </button>
          </form>
        ) : null}
      </section>

      <section className="card" aria-labelledby="profile-h">
        <h2 id="profile-h">Profile and billing contact</h2>
        <form className="admin-form" action={saveCustomerProfile}>
          <input type="hidden" name="org" value={org.id} />
          <fieldset disabled={!write}>
            <legend className="admin-vh">Profile</legend>
            <label htmlFor="p-size">Size</label>
            <select id="p-size" name="size_band" defaultValue={profile?.size_band ?? ""}>
              <option value="">Not given</option>
              {SIZE_BANDS.map((b) => (
                <option key={b} value={b}>
                  {SIZE_BAND_LABELS[b]}
                </option>
              ))}
            </select>
            <label htmlFor="p-sector">Sector</label>
            <input id="p-sector" name="sector" maxLength={80} defaultValue={profile?.sector ?? ""} />
            <label htmlFor="p-charity">Charity number</label>
            <input id="p-charity" name="charity_number" maxLength={20} defaultValue={profile?.charity_number ?? ""} />
            <label htmlFor="p-vat">VAT number</label>
            <input id="p-vat" name="vat_number" maxLength={20} defaultValue={profile?.vat_number ?? ""} />
            <label htmlFor="p-bname">Billing contact name</label>
            <input id="p-bname" name="billing_name" maxLength={120} defaultValue={profile?.billing_name ?? ""} />
            <label htmlFor="p-bemail">Billing contact email</label>
            <input id="p-bemail" name="billing_email" type="email" maxLength={254} defaultValue={profile?.billing_email ?? ""} />
            <label htmlFor="p-bcountry">Billing country code</label>
            <input id="p-bcountry" name="billing_country" maxLength={2} defaultValue={profile?.billing_country ?? ""} />
            <button type="submit" className="btn secondary">
              Save profile
            </button>
          </fieldset>
        </form>
      </section>

      <h2>Licences</h2>
      {licences.length === 0 ? <p className="muted">No licence yet.</p> : null}
      {licences.map((l) => {
        const s = summaries.get(l.id);
        const listed = (l.org_licence_titles ?? []).map((t) => t.workbook_id);
        return (
          <section key={l.id} className="card" aria-labelledby={`l-${l.id}`}>
            <h3 id={`l-${l.id}`}>
              {labelOf(LICENCE_KIND_LABELS, l.kind)}, {l.seats_purchased} seats{" "}
              <span className={`badge admin-status admin-status-${l.status}`}>{labelOf(LICENCE_STATUS_LABELS, l.status)}</span>
            </h3>
            <p className="muted">
              {formatOrgDate(l.starts_at)} to {formatOrgDate(l.ends_at)}. {labelOf(TITLE_SCOPE_LABELS, l.title_scope)}.
              {l.manual_invoice_ref ? ` Invoice ${l.manual_invoice_ref}.` : " No invoice reference."}
            </p>
            {s ? (
              <p>
                Taken: {s.seats_claimed}. Invitations waiting: {s.invitations_open}. People started: {startedText(s.started_shown, s.people_started, s.threshold)}.
              </p>
            ) : null}
            {l.title_scope === "list" ? (
              <ul className="small">
                {listed.map((w) => (
                  <li key={w}>{titleName.get(w) ?? "A title no longer live"}</li>
                ))}
              </ul>
            ) : null}

            {write && l.status !== "ended" ? (
              <details>
                <summary>Change this licence</summary>
                <form className="admin-form" action={updateLicence}>
                  <input type="hidden" name="org" value={org.id} />
                  <input type="hidden" name="licence" value={l.id} />
                  <label htmlFor={`seats-${l.id}`}>Seats</label>
                  <input id={`seats-${l.id}`} name="seats" type="number" min={1} max={10000} defaultValue={l.seats_purchased} required />
                  <label htmlFor={`start-${l.id}`}>Access starts on</label>
                  <input id={`start-${l.id}`} name="starts_on" type="date" defaultValue={isoToDateInput(l.starts_at)} required />
                  <label htmlFor={`end-${l.id}`}>Access ends at the start of</label>
                  <input id={`end-${l.id}`} name="ends_on" type="date" defaultValue={isoToDateInput(l.ends_at)} required />
                  <label htmlFor={`ref-${l.id}`}>Invoice reference</label>
                  <input id={`ref-${l.id}`} name="invoice_ref" maxLength={60} defaultValue={l.manual_invoice_ref ?? ""} />
                  <label htmlFor={`status-${l.id}`}>Status</label>
                  <select id={`status-${l.id}`} name="status" defaultValue={l.status}>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended (access paused, seats kept)</option>
                    <option value="ended">Ended (final: every seat is released)</option>
                  </select>
                  <div className="check">
                    <input id={`confirm-${l.id}`} name="confirm_end" type="checkbox" value="yes" />
                    <label htmlFor={`confirm-${l.id}`}>If ending: I understand every seat is released and this cannot be undone</label>
                  </div>
                  <label htmlFor={`reason-${l.id}`}>Reason (kept in the audit log)</label>
                  <input id={`reason-${l.id}`} name="reason" maxLength={500} required />
                  <button type="submit" className="btn secondary">
                    Save licence
                  </button>
                </form>
                {l.title_scope === "list" ? (
                  <form className="admin-form" action={setLicenceTitles}>
                    <input type="hidden" name="org" value={org.id} />
                    <input type="hidden" name="licence" value={l.id} />
                    <fieldset>
                      <legend>Titles on this licence</legend>
                      {titles.map((t) => (
                        <div className="check" key={t.id}>
                          <input id={`t-${l.id}-${t.id}`} name="titles" type="checkbox" value={t.id} defaultChecked={listed.includes(t.id)} />
                          <label htmlFor={`t-${l.id}-${t.id}`}>
                            {t.title} <code>{t.code}</code>
                          </label>
                        </div>
                      ))}
                    </fieldset>
                    <button type="submit" className="btn secondary">
                      Save titles
                    </button>
                  </form>
                ) : null}
              </details>
            ) : null}
          </section>
        );
      })}

      {write && org.status !== "closed" ? (
        <section className="card admin-create" aria-labelledby="new-licence-h">
          <h2 id="new-licence-h">Record a licence</h2>
          <p className="muted small">
            Record it once terms are agreed and the invoice is raised outside the app. Seats count people. Higher-tier wellbeing titles and demo titles
            are never on a licence.
          </p>
          <form className="admin-form" action={createLicence}>
            <input type="hidden" name="org" value={org.id} />
            <label htmlFor="nl-kind">Kind</label>
            <select id="nl-kind" name="kind" defaultValue="pilot" required>
              {LICENCE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {LICENCE_KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <label htmlFor="nl-seats">Seats</label>
            <input id="nl-seats" name="seats" type="number" min={1} max={10000} required />
            <label htmlFor="nl-start">Access starts on</label>
            <input id="nl-start" name="starts_on" type="date" defaultValue={dates.start} required />
            <label htmlFor="nl-end">Access ends at the start of</label>
            <input id="nl-end" name="ends_on" type="date" defaultValue={dates.end} required />
            <label htmlFor="nl-ref">Invoice reference (optional)</label>
            <input id="nl-ref" name="invoice_ref" maxLength={60} />
            <label htmlFor="nl-scope">Titles</label>
            <select id="nl-scope" name="title_scope" defaultValue="membership" required>
              {TITLE_SCOPES.map((s) => (
                <option key={s} value={s}>
                  {TITLE_SCOPE_LABELS[s]}
                </option>
              ))}
            </select>
            <fieldset>
              <legend>Chosen titles (only for a chosen-titles licence)</legend>
              {titles.length === 0 ? <p className="muted">No live titles to choose from.</p> : null}
              {titles.map((t) => (
                <div className="check" key={t.id}>
                  <input id={`nt-${t.id}`} name="titles" type="checkbox" value={t.id} />
                  <label htmlFor={`nt-${t.id}`}>
                    {t.title} <code>{t.code}</code>
                    {t.in_membership ? "" : " (not in the membership)"}
                  </label>
                </div>
              ))}
            </fieldset>
            <button type="submit" className="btn">
              Record licence
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
