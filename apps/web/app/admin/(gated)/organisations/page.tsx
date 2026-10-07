import type { Metadata } from "next";
import { formatAdminDate } from "@/lib/admin/leads";
import { CREATABLE_ORG_KINDS, embeddedCount, ORG_KIND_LABELS, ORG_STATUS_LABELS, orgKindLabel } from "@/lib/admin/organisations";
import { adminAbilities, ORGANISATION_INSERT_ALLOWED } from "@/lib/admin/permissions";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { AdminBack, labelFor } from "../_components/Bits";
import { Notice } from "../_components/Notice";
import { createOrganisation } from "./actions";

export const metadata: Metadata = { title: "Organisations", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

interface OrgRow {
  id: string;
  code: string | null;
  kind: string;
  display_name: string;
  status: string;
  is_demo: boolean;
  created_at: string;
  org_members: unknown;
}

const LIMIT = 500;

/**
 * Organisations (F-082, light). Any staff role reads the list through
 * organisations_read. Owners and editors create one through
 * public.create_organisation (migration 0008), which mints the code and
 * writes the audit row.
 */
export default async function AdminOrganisationsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const staff = await getStaffSession("/admin/organisations");
  const sp = await searchParams;
  const can = adminAbilities(staff.roles);

  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("organisations")
    .select("id, code, kind, display_name, status, is_demo, created_at, org_members(count)")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (error) console.error("admin_orgs_read_failed", error.code ?? "");
  const orgs = (data ?? []) as OrgRow[];

  const formOpen = can.createOrganisations && ORGANISATION_INSERT_ALLOWED;

  return (
    <div className="admin-page">
      <AdminBack />
      <h1>Organisations</h1>
      <p className="muted">Publishers, author companies and sole authors, with the Akana house organisation.</p>
      <Notice code={sp.notice} />

      {error ? (
        <p className="admin-notice admin-notice-error" role="alert">
          Organisations could not be loaded. Try again.
        </p>
      ) : orgs.length === 0 ? (
        <div className="card admin-empty">
          <h2>No organisations yet</h2>
          <p className="muted">Organisations will appear here once they are created.</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="admin-vh">Organisations</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Kind</th>
                <th scope="col">Code</th>
                <th scope="col">Status</th>
                <th scope="col">Members</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td>
                    {o.display_name}
                    {o.is_demo ? (
                      <>
                        {" "}
                        <span className="badge demo">Demo</span>
                      </>
                    ) : null}
                  </td>
                  <td>{orgKindLabel(o.kind)}</td>
                  <td>{o.code ? <code>{o.code}</code> : <span className="muted">None yet</span>}</td>
                  <td>{labelFor(ORG_STATUS_LABELS, o.status)}</td>
                  <td>{embeddedCount(o.org_members)}</td>
                  <td>{formatAdminDate(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {can.createOrganisations ? (
        <section className="card admin-create" aria-labelledby="org-create-h">
          <h2 id="org-create-h">Create organisation</h2>
          {!ORGANISATION_INSERT_ALLOWED ? (
            <p className="admin-note">
              Not available yet. The database has no insert policy on organisations, so a migration is needed before staff can create one here.
            </p>
          ) : null}
          <form className="admin-form" action={createOrganisation}>
            <fieldset disabled={!formOpen}>
              <legend className="admin-vh">New organisation</legend>
              <label htmlFor="org-kind">Kind</label>
              <select id="org-kind" name="kind" defaultValue="" required>
                <option value="" disabled>
                  Choose a kind
                </option>
                {CREATABLE_ORG_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ORG_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
              <label htmlFor="org-display">Display name</label>
              <input id="org-display" name="display_name" maxLength={200} required />
              <label htmlFor="org-legal">Legal name</label>
              <input id="org-legal" name="legal_name" maxLength={300} required />
              <label htmlFor="org-country">Country code</label>
              <input id="org-country" name="country" maxLength={2} placeholder="GB" autoCapitalize="characters" required />
              <button type="submit" className="btn">
                Create organisation
              </button>
            </fieldset>
          </form>
        </section>
      ) : (
        <p className="admin-note">Your role can view organisations. Only owners and editors can create them.</p>
      )}
    </div>
  );
}
