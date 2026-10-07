import type { Metadata } from "next";
import Link from "next/link";
import { AdminBack } from "../_components/Bits";
import { Notice } from "../_components/Notice";
import { addDemoLogin, removeDemoLogin, resetDemo } from "./actions";
import { whiteLabelAbilities } from "@/lib/admin/white-label";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { DEMO_TENANT_ID, demoTenantHosts } from "@/lib/tenant";
import { DEMO_LOOKS } from "@/lib/tenant-brand";

export const metadata: Metadata = { title: "Demo", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const DEMO_ORG_ID = "00000000-0000-0000-0000-0000000000d0";

/**
 * The demo publisher, its white-label site and its logins (F-045, F-074).
 * Reset puts everything back: the invented publisher Quillmoor Demo Press,
 * two imprints, two authors, four workbooks in draft, in review, live and
 * paused, the demo site with the chosen look and catalogue, and the
 * registered demo logins as the only members. It also runs every night.
 */
export default async function DemoAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await getStaffSession("/admin/demo");
  const can = whiteLabelAbilities(staff.roles);
  const sp = await searchParams;
  const supabase = await createUserClient();

  const [{ data: tenant }, { data: wbs }, logins] = await Promise.all([
    supabase.from("tenants").select("id, name, status, brand").eq("id", DEMO_TENANT_ID).maybeSingle(),
    supabase.from("workbooks").select("code, title, status").eq("org_id", DEMO_ORG_ID).neq("status", "retired").order("code"),
    can.resetDemo ? supabase.rpc("demo_account_list") : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);
  const workbooks = (wbs ?? []) as { code: string; title: string; status: string }[];
  const accounts = ((logins.data ?? []) as { user_id: string; email: string; kind: string; created_at: string }[]) ?? [];
  const apex = process.env.TENANT_APEX ? `demo.${process.env.TENANT_APEX}` : null;
  const hosts = [...demoTenantHosts(), ...(apex ? [apex] : [])];

  return (
    <div>
      <AdminBack />
      <h1>
        Demo publisher and site <span className="badge demo">Demo</span>
      </h1>
      <Notice code={sp.notice} />
      <p>
        Quillmoor Demo Press is invented. Its authors and workbooks are invented and labelled Demo everywhere. Its site sells nothing: demo
        workbooks cannot be bought, are not in the membership and never appear in statements.
      </p>

      <section aria-labelledby="state-h">
        <h2 id="state-h">Current state</h2>
        {tenant ? (
          <p>
            Site: <Link href={`/admin/white-label/${DEMO_TENANT_ID}`}>{(tenant as { name: string }).name}</Link>, {(tenant as { status: string }).status}.
          </p>
        ) : (
          <p className="muted">The demo has not been created on this database yet. Reset it to create it.</p>
        )}
        {workbooks.length ? (
          <ul>
            {workbooks.map((w) => (
              <li key={w.code}>
                {w.code} {w.title}: {w.status.replace("_", " ")}
              </li>
            ))}
          </ul>
        ) : null}
        <p>
          The demo site answers on: {hosts.join(", ")}. Set DEMO_TENANT_HOSTS to add a preview alias. No domain is registered for it.
        </p>
      </section>

      <section aria-labelledby="reset-h">
        <h2 id="reset-h">Reset</h2>
        {can.resetDemo ? (
          <form action={resetDemo} className="admin-form">
            <fieldset>
              <legend>Site look</legend>
              <label>
                <input type="radio" name="look" value="" defaultChecked /> Keep the current look
              </label>
              {Object.entries(DEMO_LOOKS).map(([k, l]) => (
                <label key={k}>
                  <input type="radio" name="look" value={k} /> {l.label}
                </label>
              ))}
            </fieldset>
            <button type="submit" className="btn">
              Reset the demo now
            </button>
          </form>
        ) : (
          <p className="muted">Platform owners and editors can reset the demo.</p>
        )}
      </section>

      <section aria-labelledby="logins-h">
        <h2 id="logins-h">Demo logins</h2>
        <p>
          Create the demo author and demo publisher sign-ins yourself in Supabase Auth, with addresses you control. Then register each one here.
          A staff account, or an account that belongs to a real organisation, is refused. The next reset gives them their places: the publisher
          login owns Quillmoor Demo Press and runs its site; the author login is Odalys Penhaligon-Reyes.
        </p>
        {accounts.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Email</th>
                  <th scope="col">Login</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.user_id}>
                    <td>{a.email}</td>
                    <td>{a.kind === "publisher" ? "Demo publisher" : "Demo author"}</td>
                    <td>
                      {can.manageDemoLogins ? (
                        <form action={removeDemoLogin}>
                          <input type="hidden" name="user_id" value={a.user_id} />
                          <button type="submit" className="btn secondary">
                            Remove
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No demo logins registered yet.</p>
        )}
        {can.manageDemoLogins ? (
          <form action={addDemoLogin} className="admin-form">
            <label htmlFor="demo-email">Email of an existing sign-in</label>
            <input id="demo-email" name="email" type="email" required autoComplete="off" />
            <label htmlFor="demo-kind">Login</label>
            <select id="demo-kind" name="kind" defaultValue="author">
              <option value="author">Demo author</option>
              <option value="publisher">Demo publisher</option>
            </select>
            <button type="submit" className="btn">
              Register demo login
            </button>
          </form>
        ) : (
          <p className="muted">Platform owners register demo logins.</p>
        )}
      </section>
    </div>
  );
}
