import type { Metadata } from "next";
import Link from "next/link";
import { AdminBack } from "../_components/Bits";
import { Notice } from "../_components/Notice";
import { whiteLabelAbilities } from "@/lib/admin/white-label";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "White-label sites", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** White-label tenants (F-067, F-069). Read through the user client; any staff role may look. */
export default async function WhiteLabelPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await getStaffSession("/admin/white-label");
  const can = whiteLabelAbilities(staff.roles);
  const sp = await searchParams;
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("tenants")
    .select("id, slug, name, status, is_demo")
    .eq("kind", "white_label")
    .order("name")
    .limit(200);
  if (error) console.error("admin_tenants_failed", error.code ?? "");
  const rows = (data ?? []) as { id: string; slug: string; name: string; status: string; is_demo: boolean }[];

  return (
    <div>
      <AdminBack />
      <h1>White-label sites</h1>
      <Notice code={sp.notice} />
      <p>
        Each site shows the workbooks its tenant chooses, in its own brand. Help now, the wellness notice, safety copy and the privacy pages are
        locked and cannot be changed by a tenant. Prices here are settings only: tenant sites do not sell yet.
      </p>
      <p>
        <Link href="/admin/demo">Demo publisher and logins</Link>
        {can.editTenants ? null : <span className="muted"> (your role can look but not change sites)</span>}
      </p>
      {rows.length === 0 ? (
        <p className="muted">No white-label sites yet. Reset the demo to create the demo site.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Site</th>
                <th scope="col">Slug</th>
                <th scope="col">Status</th>
                <th scope="col">Demo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link href={`/admin/white-label/${t.id}`}>{t.name}</Link>
                  </td>
                  <td>{t.slug}</td>
                  <td>{t.status}</td>
                  <td>{t.is_demo ? <span className="badge demo">Demo</span> : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
