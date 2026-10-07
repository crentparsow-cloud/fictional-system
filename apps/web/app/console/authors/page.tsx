import type { Metadata } from "next";
import Link from "next/link";
import { OrgSwitcher, StudioNotice } from "@/components/studio/StudioBits";
import { roleCan, withOrg } from "@/lib/studio";
import { requireStudio } from "@/lib/studio-server";
import { createUserClient } from "@/lib/supabase/server";
import { addRosterAuthor, inviteMember, saveImprint } from "../actions";

export const metadata: Metadata = { title: "Authors and imprints", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

interface AuthorRow {
  id: string;
  code: string | null;
  display_name: string;
  bio_status: string;
  has_login: boolean;
  is_demo: boolean;
}

const BIO: Record<string, string> = { none: "No bio", pending: "Bio waiting for approval", approved: "Bio approved", rejected: "Bio needs changes" };

/**
 * Author roster and imprints (F-056). Authors are profiles without logins
 * unless invited; an invitation tied to a roster entry links the login to
 * it when accepted. An imprint is a label and a statement filter, never a
 * permission boundary.
 */
export default async function ConsoleAuthorsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const ctx = await requireStudio("/console/authors", sp.org);
  const can = roleCan(ctx.org.role);
  const supabase = await createUserClient();
  const [authors, imprints] = await Promise.all([
    supabase.rpc("studio_authors", { p_org: ctx.org.id }),
    supabase.from("imprints").select("id, name").eq("org_id", ctx.org.id).order("name"),
  ]);
  const rows = (authors.data ?? []) as AuthorRow[];
  const imps = (imprints.data ?? []) as { id: string; name: string }[];

  return (
    <div className="admin-page studio-page">
      <OrgSwitcher ctx={ctx} path="/console/authors" />
      <p className="admin-back">
        <Link href={withOrg("/console", ctx.org.id, ctx.multi)}>Team</Link>
      </p>
      <h1>Authors and imprints</h1>
      <StudioNotice code={sp.notice} />

      <h2>Authors</h2>
      {rows.length === 0 ? <p className="muted">No authors on the roster yet.</p> : null}
      <ul className="studio-list">
        {rows.map((a) => (
          <li key={a.id} className="card">
            <p>
              <strong>{a.display_name}</strong> {a.code ? <code>{a.code}</code> : null} {a.is_demo ? <span className="badge demo">Demo</span> : null}
            </p>
            <p className="muted small">
              {a.has_login ? "Has a login." : "No login."} {BIO[a.bio_status] ?? ""}.
            </p>
            {!a.has_login && can.manageMembers ? (
              <form className="admin-form studio-inline-form" action={inviteMember}>
                <input type="hidden" name="org" value={ctx.org.id} />
                <input type="hidden" name="author" value={a.id} />
                <input type="hidden" name="role" value="author" />
                <input type="hidden" name="from" value="authors" />
                <label htmlFor={`ai-${a.id}`}>Invite {a.display_name} to log in</label>
                <input id={`ai-${a.id}`} name="email" type="email" maxLength={254} required autoComplete="off" placeholder="Their email address" />
                <button type="submit" className="admin-row-btn">
                  Send invitation
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>

      {can.writeBooks ? (
        <section className="card admin-create" aria-labelledby="ra-h">
          <h2 id="ra-h">Add an author to the roster</h2>
          <form className="admin-form" action={addRosterAuthor}>
            <input type="hidden" name="org" value={ctx.org.id} />
            <label htmlFor="ra-name">Name readers see</label>
            <input id="ra-name" name="display_name" maxLength={120} required />
            <label htmlFor="ra-legal">Legal name (private)</label>
            <input id="ra-legal" name="legal_name" maxLength={200} />
            <label htmlFor="ra-country">Country code</label>
            <input id="ra-country" name="country" maxLength={2} placeholder="GB" />
            <button type="submit" className="btn">
              Add author
            </button>
          </form>
        </section>
      ) : null}

      <h2>Imprints</h2>
      <p className="muted">Imprints are labels for your books and statements. They do not change who can see what.</p>
      {imps.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <ul className="studio-plain">
          {imps.map((i) => (
            <li key={i.id}>{i.name}</li>
          ))}
        </ul>
      )}
      {can.writeBooks ? (
        <form className="admin-form" action={saveImprint}>
          <input type="hidden" name="org" value={ctx.org.id} />
          <label htmlFor="imp-name">New imprint</label>
          <input id="imp-name" name="name" maxLength={120} required />
          <button type="submit" className="btn secondary">
            Add imprint
          </button>
        </form>
      ) : null}
    </div>
  );
}
