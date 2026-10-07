import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrgSwitcher, StudioNotice } from "@/components/studio/StudioBits";
import { isPast, ORG_ROLE_HELP, ORG_ROLE_LABELS, OWNER_GRANTABLE_ROLES, parseOrgRole, roleCan, withOrg } from "@/lib/studio";
import { requireStudio } from "@/lib/studio-server";
import { createUserClient } from "@/lib/supabase/server";
import { inviteMember, removeMember, resendInvite, revokeInvite, setMemberRole } from "./actions";

export const metadata: Metadata = { title: "Team", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

interface Member {
  user_id: string;
  email: string;
  display_name: string | null;
  role: string;
  joined_at: string;
  is_me: boolean;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

const date = (s: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }).format(new Date(s));

/**
 * Organisation console (F-055): members and invitations. One console for
 * publishers and sole authors. Owners invite, resend, cancel, change roles
 * and remove members. The database keeps one owner, and ownership changes
 * go through Akana staff at launch. A removed member loses access on their
 * next request, payouts included, because every rule reads membership live.
 */
export default async function ConsolePage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const ctx = await requireStudio("/console", sp.org);
  const can = roleCan(ctx.org.role);
  const supabase = await createUserClient();
  const roster = await supabase.rpc("org_roster", { p_org: ctx.org.id });
  if (roster.error && roster.error.code === "AKS01") notFound();
  const members = (roster.data ?? []) as Member[];
  const invites = can.manageMembers
    ? (((
        await supabase
          .from("org_invitations")
          .select("id, email, role, created_at, expires_at, accepted_at, revoked_at")
          .eq("org_id", ctx.org.id)
          .is("accepted_at", null)
          .is("revoked_at", null)
          .order("created_at", { ascending: false })
      ).data ?? []) as Invite[])
    : [];
  return (
    <div className="admin-page studio-page">
      <OrgSwitcher ctx={ctx} path="/console" />
      <h1>Team</h1>
      <p className="muted">
        People who can work on {ctx.org.displayName}. <Link href={withOrg("/console/authors", ctx.org.id, ctx.multi)}>Authors and imprints</Link>
      </p>
      <StudioNotice code={sp.notice} />

      <div className="admin-table-wrap">
        <table className="admin-table">
          <caption className="admin-vh">Members</caption>
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col">Role</th>
              <th scope="col">Joined</th>
              {can.manageMembers ? <th scope="col">Change</th> : null}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const role = parseOrgRole(m.role);
              const ownerRow = m.role === "owner";
              return (
                <tr key={m.user_id}>
                  <td>
                    {m.display_name ? (
                      <>
                        {m.display_name}
                        <br />
                      </>
                    ) : null}
                    <span className="muted">{m.email}</span>
                    {m.is_me ? <span className="muted"> (you)</span> : null}
                  </td>
                  <td>{role ? ORG_ROLE_LABELS[role] : m.role}</td>
                  <td>{date(m.joined_at)}</td>
                  {can.manageMembers ? (
                    <td>
                      {ownerRow ? (
                        <span className="muted small">Ownership changes go through Akana staff.</span>
                      ) : (
                        <div className="studio-row-actions">
                          <form action={setMemberRole} className="studio-inline">
                            <input type="hidden" name="org" value={ctx.org.id} />
                            <input type="hidden" name="user" value={m.user_id} />
                            <label className="admin-vh" htmlFor={`r-${m.user_id}`}>
                              Role for {m.email}
                            </label>
                            <select id={`r-${m.user_id}`} name="role" defaultValue={m.role}>
                              {OWNER_GRANTABLE_ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {ORG_ROLE_LABELS[r]}
                                </option>
                              ))}
                            </select>
                            <button type="submit" className="admin-row-btn">
                              Change role
                            </button>
                          </form>
                          <form action={removeMember} className="studio-inline">
                            <input type="hidden" name="org" value={ctx.org.id} />
                            <input type="hidden" name="user" value={m.user_id} />
                            <label className="check">
                              <input type="checkbox" name="confirm" value="yes" required />
                              <span>Yes, remove</span>
                            </label>
                            <button type="submit" className="admin-row-btn">
                              Remove <span className="admin-vh">{m.email}</span>
                            </button>
                          </form>
                        </div>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {can.manageMembers ? (
        <>
          <h2>Open invitations</h2>
          {invites.length === 0 ? (
            <p className="muted">None.</p>
          ) : (
            <ul className="studio-list">
              {invites.map((i) => {
                const role = parseOrgRole(i.role);
                const expired = isPast(i.expires_at);
                return (
                  <li key={i.id} className="card">
                    <p>
                      <strong>{i.email}</strong> as {role ? ORG_ROLE_LABELS[role].toLowerCase() : i.role}.{" "}
                      <span className="muted">{expired ? "Expired." : `Sent ${date(i.created_at)}, open until ${date(i.expires_at)}.`}</span>
                    </p>
                    <div className="studio-row-actions">
                      <form action={resendInvite}>
                        <input type="hidden" name="org" value={ctx.org.id} />
                        <input type="hidden" name="invite" value={i.id} />
                        <button type="submit" className="admin-row-btn">
                          Send again
                        </button>
                      </form>
                      <form action={revokeInvite}>
                        <input type="hidden" name="org" value={ctx.org.id} />
                        <input type="hidden" name="invite" value={i.id} />
                        <button type="submit" className="admin-row-btn">
                          Cancel invitation
                        </button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <section className="card admin-create" aria-labelledby="inv-h">
            <h2 id="inv-h">Invite someone</h2>
            <form className="admin-form" action={inviteMember}>
              <input type="hidden" name="org" value={ctx.org.id} />
              <label htmlFor="inv-email">Email address</label>
              <input id="inv-email" name="email" type="email" maxLength={254} required autoComplete="off" />
              <fieldset className="studio-radios">
                <legend>Role</legend>
                {OWNER_GRANTABLE_ROLES.map((r) => (
                  <label key={r} className="check">
                    <input type="radio" name="role" value={r} required defaultChecked={r === "editor"} />
                    <span>
                      <strong>{ORG_ROLE_LABELS[r]}.</strong> {ORG_ROLE_HELP[r]}
                    </span>
                  </label>
                ))}
              </fieldset>
              <p className="muted small">The link works once, for that address only, and lasts 14 days.</p>
              <button type="submit" className="btn">
                Send invitation
              </button>
            </form>
          </section>
        </>
      ) : (
        <p className="admin-note">Only owners invite people and change roles.</p>
      )}
    </div>
  );
}
