import type { Metadata } from "next";
import { LicenceDraftBanner, StudioNotice } from "@/components/studio/StudioBits";
import { adminAbilities } from "@/lib/admin/permissions";
import { bioClaimFlags, LICENCE_STATUS_LABELS, ORG_ROLE_LABELS, ORG_ROLES } from "@/lib/studio";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { AdminBack } from "../_components/Bits";
import { reviewBio, staffInvite, verifyLicence } from "./actions";

export const metadata: Metadata = { title: "Authors", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

const date = (s: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }).format(new Date(s));

/**
 * Author onboarding for staff (F-033, F-034, F-036). Invite the first person
 * to an organisation, review bios before they go public, and check signed
 * licence uploads. Signups are invite only; there is no public form.
 */
export default async function AdminAuthorsPage({ searchParams }: { searchParams: Search }) {
  const staff = await getStaffSession("/admin/authors");
  const sp = await searchParams;
  const can = adminAbilities(staff.roles).createOrganisations;
  const supabase = await createUserClient();

  const [orgs, texts, bios, uploads, invites] = await Promise.all([
    supabase.from("organisations").select("id, display_name, kind, is_demo").neq("kind", "akana_house").order("display_name").limit(500),
    supabase.from("licence_texts").select("version, status, is_placeholder, approved_at").order("created_at", { ascending: false }),
    supabase.rpc("staff_pending_bios"),
    supabase
      .from("licences")
      .select("id, ref, org_id, text_version, signer_name, signer_capacity, signed_at, signed_document_path, books(title), organisations(display_name)")
      .eq("status", "pending_verification")
      .order("signed_at"),
    supabase
      .from("org_invitations")
      .select("id, email, role, created_at, expires_at, organisations(display_name)")
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const textRows = (texts.data ?? []) as { version: string; status: string; is_placeholder: boolean; approved_at: string | null }[];
  const approved = textRows.some((t) => t.status === "approved");
  const bioRows = (bios.data ?? []) as { author_id: string; organisation_name: string | null; display_name: string; bio_draft: string | null; bio_submitted_at: string | null }[];
  const uploadRows = (uploads.data ?? []) as unknown as {
    id: string;
    ref: string;
    text_version: string;
    signer_name: string;
    signer_capacity: string;
    signed_at: string;
    signed_document_path: string;
    books: { title: string } | null;
    organisations: { display_name: string } | null;
  }[];
  const inviteRows = (invites.data ?? []) as unknown as { id: string; email: string; role: string; created_at: string; expires_at: string; organisations: { display_name: string } | null }[];

  return (
    <div className="admin-page">
      <AdminBack />
      <h1>Authors</h1>
      <p className="muted">Invite-only onboarding for authors and publishers, bio approval and signed licence checks.</p>
      <StudioNotice code={sp.notice} />

      <section className="card admin-create" aria-labelledby="lt-h">
        <h2 id="lt-h">Licence text</h2>
        {approved ? null : <LicenceDraftBanner />}
        <ul className="studio-plain">
          {textRows.map((t) => (
            <li key={t.version}>
              Version <code>{t.version}</code>: {t.status}
              {t.is_placeholder ? ", placeholder text that can never be approved" : ""}
              {t.approved_at ? `, approved ${date(t.approved_at)}` : ""}.
            </li>
          ))}
        </ul>
        <p className="admin-note">
          When the approved text from the lawyer arrives, it is added as a new version in a migration, then a platform owner approves it. Until then nobody signs for a
          real book and no licensed workbook can go live.
        </p>
      </section>

      <section className="card admin-create" aria-labelledby="inv-h">
        <h2 id="inv-h">Invite an author or publisher</h2>
        <p className="muted">Create the organisation first under Organisations. Then invite its owner here.</p>
        <form className="admin-form" action={staffInvite}>
          <fieldset disabled={!can}>
            <legend className="admin-vh">Invitation</legend>
            <label htmlFor="si-org">Organisation</label>
            <select id="si-org" name="org" required defaultValue="">
              <option value="" disabled>
                Choose an organisation
              </option>
              {((orgs.data ?? []) as { id: string; display_name: string; is_demo: boolean }[]).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.display_name}
                  {o.is_demo ? " (demo)" : ""}
                </option>
              ))}
            </select>
            <label htmlFor="si-email">Email address</label>
            <input id="si-email" name="email" type="email" maxLength={254} required autoComplete="off" />
            <label htmlFor="si-role">Role</label>
            <select id="si-role" name="role" defaultValue="owner">
              {ORG_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ORG_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <button type="submit" className="btn">
              Send invitation
            </button>
          </fieldset>
        </form>
        {!can ? <p className="admin-note">Only owners and editors send invitations.</p> : null}
        {inviteRows.length > 0 ? (
          <>
            <h3>Open invitations</h3>
            <ul className="studio-plain">
              {inviteRows.map((i) => (
                <li key={i.id}>
                  {i.email} to {i.organisations?.display_name ?? "an organisation"} as {i.role}, sent {date(i.created_at)}, open until {date(i.expires_at)}.
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section className="card admin-create" aria-labelledby="bio-h">
        <h2 id="bio-h">Bios waiting for approval</h2>
        {bioRows.length === 0 ? <p className="muted">None.</p> : null}
        {bioRows.map((b) => {
          const flags = bioClaimFlags(b.bio_draft ?? "");
          return (
            <article key={b.author_id} className="studio-sub">
              <h3>
                {b.display_name} <span className="muted small">{b.organisation_name ?? ""}</span>
              </h3>
              <p className="studio-bio">{b.bio_draft}</p>
              {flags.length > 0 ? (
                <p className="admin-notice admin-notice-error">Flagged: {flags.join(", ")}. Approving needs a reason, which is logged.</p>
              ) : null}
              <form className="admin-form" action={reviewBio}>
                <fieldset disabled={!can}>
                  <legend className="admin-vh">Decision for {b.display_name}</legend>
                  <input type="hidden" name="author" value={b.author_id} />
                  <label htmlFor={`br-${b.author_id}`}>Reason {flags.length > 0 ? "(needed)" : "(needed to reject)"}</label>
                  <input id={`br-${b.author_id}`} name="reason" maxLength={500} />
                  <div className="studio-row-actions">
                    <button type="submit" name="decision" value="approve" className="btn">
                      Approve
                    </button>
                    <button type="submit" name="decision" value="reject" className="btn secondary">
                      Ask for changes
                    </button>
                  </div>
                </fieldset>
              </form>
            </article>
          );
        })}
      </section>

      <section className="card admin-create" aria-labelledby="up-h">
        <h2 id="up-h">Signed licence uploads to check</h2>
        {uploadRows.length === 0 ? <p className="muted">None.</p> : null}
        {uploadRows.map((u) => (
          <article key={u.id} className="studio-sub">
            <h3>
              {u.books?.title ?? "Book"} <code>{u.ref}</code>
            </h3>
            <p>
              {u.organisations?.display_name}. Signed by {u.signer_name} ({u.signer_capacity}) on {date(u.signed_at)}, on licence version {u.text_version}.{" "}
              {LICENCE_STATUS_LABELS.pending_verification}.
            </p>
            <p>
              <a href={`/files/open?path=${encodeURIComponent(u.signed_document_path)}`}>Open the signed copy</a>
            </p>
            <form className="admin-form" action={verifyLicence}>
              <fieldset disabled={!can}>
                <legend className="admin-vh">Decision for {u.ref}</legend>
                <input type="hidden" name="licence" value={u.id} />
                <label htmlFor={`lv-${u.id}`}>Reason</label>
                <input id={`lv-${u.id}`} name="reason" maxLength={500} required />
                <div className="studio-row-actions">
                  <button type="submit" name="decision" value="accept" className="btn" disabled={!approved}>
                    Accept
                  </button>
                  <button type="submit" name="decision" value="reject" className="btn secondary">
                    Reject
                  </button>
                </div>
              </fieldset>
            </form>
          </article>
        ))}
      </section>
    </div>
  );
}
