import type { Metadata } from "next";
import Link from "next/link";
import { OrgNoticeLine } from "@/components/org/OrgShell";
import { formatAdminDate } from "@/lib/admin/leads";
import { adminAbilities } from "@/lib/admin/permissions";
import { CUSTOMER_KIND_LABELS, CUSTOMER_ORG_KINDS, labelOf, SIZE_BAND_LABELS, SIZE_BANDS } from "@/lib/org-pilot";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { AdminBack } from "../_components/Bits";
import { createCustomerOrganisation } from "./actions";

export const metadata: Metadata = { title: "Customers", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

interface Row {
  id: string;
  kind: string;
  display_name: string;
  status: string;
  created_at: string;
  org_licences: { id: string; status: string }[] | null;
}

/**
 * Customer organisations (F-201, F-202): businesses, churches, charities and
 * community groups using Akana for their people. The manual-sales pilot:
 * staff create the organisation, record a licence once terms are agreed and
 * an invoice is raised outside the app, and invite the person who will run
 * it. No organisation goes live until the lawyer approves the organisation
 * terms and DPA (O10) and Crent sets prices (N2).
 */
export default async function AdminBusinessPage({ searchParams }: { searchParams: Promise<Search> }) {
  const staff = await getStaffSession("/admin/business");
  const sp = await searchParams;
  const can = adminAbilities(staff.roles);
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("organisations")
    .select("id, kind, display_name, status, created_at, org_licences(id, status)")
    .in("kind", [...CUSTOMER_ORG_KINDS])
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) console.error("admin_customers_read_failed", error.code ?? "");
  const rows = (data ?? []) as Row[];

  return (
    <div className="admin-page">
      <AdminBack />
      <h1>Customers</h1>
      <p className="muted">Organisations that use Akana for their people. Seats are sold by hand and invoiced outside the app.</p>
      <p className="admin-note" role="note">
        Pilot only. The organisation terms, DPA and privacy notice section are drafts for the lawyer (docs/legal). Do not start a real organisation
        until they are approved and prices are set.
      </p>
      <OrgNoticeLine code={sp.notice} />

      {rows.length === 0 ? (
        <div className="card admin-empty">
          <h2>No customers yet</h2>
          <p className="muted">Customer organisations appear here once they are created.</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="admin-vh">Customer organisations</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Kind</th>
                <th scope="col">Active licences</th>
                <th scope="col">Status</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/admin/business/${o.id}`}>{o.display_name}</Link>
                  </td>
                  <td>{labelOf(CUSTOMER_KIND_LABELS, o.kind)}</td>
                  <td>{(o.org_licences ?? []).filter((l) => l.status === "active").length}</td>
                  <td>{o.status}</td>
                  <td>{formatAdminDate(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {can.createOrganisations ? (
        <section className="card admin-create" aria-labelledby="cust-create-h">
          <h2 id="cust-create-h">Create a customer organisation</h2>
          <form className="admin-form" action={createCustomerOrganisation}>
            <label htmlFor="c-kind">Kind</label>
            <select id="c-kind" name="kind" defaultValue="" required>
              <option value="" disabled>
                Choose a kind
              </option>
              {CUSTOMER_ORG_KINDS.map((k) => (
                <option key={k} value={k}>
                  {CUSTOMER_KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <p className="muted small">No church offer goes out until faith titles exist. A church can be set up for general titles only.</p>
            <label htmlFor="c-display">Display name</label>
            <input id="c-display" name="display_name" maxLength={200} required />
            <label htmlFor="c-legal">Legal name</label>
            <input id="c-legal" name="legal_name" maxLength={300} required />
            <label htmlFor="c-country">Country code</label>
            <input id="c-country" name="country" maxLength={2} placeholder="GB" autoCapitalize="characters" required />
            <label htmlFor="c-size">Size</label>
            <select id="c-size" name="size_band" defaultValue="">
              <option value="">Not given</option>
              {SIZE_BANDS.map((b) => (
                <option key={b} value={b}>
                  {SIZE_BAND_LABELS[b]}
                </option>
              ))}
            </select>
            <label htmlFor="c-sector">Sector (optional)</label>
            <input id="c-sector" name="sector" maxLength={80} />
            <label htmlFor="c-charity">Charity number (optional)</label>
            <input id="c-charity" name="charity_number" maxLength={20} />
            <label htmlFor="c-vat">VAT number (optional)</label>
            <input id="c-vat" name="vat_number" maxLength={20} placeholder="GB123456789" />
            <label htmlFor="c-bname">Billing contact name (optional)</label>
            <input id="c-bname" name="billing_name" maxLength={120} />
            <label htmlFor="c-bemail">Billing contact email (optional)</label>
            <input id="c-bemail" name="billing_email" type="email" maxLength={254} />
            <button type="submit" className="btn">
              Create organisation
            </button>
          </form>
        </section>
      ) : (
        <p className="admin-note">Your role can view customers. Only owners and editors can create them.</p>
      )}
    </div>
  );
}
