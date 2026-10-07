import type { Metadata } from "next";
import { OrgSwitcher, StudioNotice } from "@/components/studio/StudioBits";
import { roleCan } from "@/lib/studio";
import { requireStudio } from "@/lib/studio-server";
import { createUserClient } from "@/lib/supabase/server";
import { saveProfile, submitBio } from "../actions";

export const metadata: Metadata = { title: "Profile", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

interface AuthorRow {
  id: string;
  code: string | null;
  display_name: string;
  legal_name: string | null;
  bio: string | null;
  bio_draft: string | null;
  bio_status: string;
  bio_flags: { phrase?: string }[];
  country: string | null;
  website: string | null;
  links: string[];
  spelling: string;
  photo_rights_confirmed_at: string | null;
  is_me: boolean;
  can_edit: boolean;
}

const BIO_STATUS: Record<string, string> = {
  none: "No bio sent yet.",
  pending: "Waiting for the Akana team to approve it.",
  approved: "Approved. This is the bio readers see.",
  rejected: "The team asked for changes. Edit it and send it again.",
};

/**
 * Author profile (F-034). Pen name and legal name are held apart: the legal
 * name is for contracts and statements and never shows publicly. The bio
 * runs the claim-word check and goes to staff before it is public.
 */
export default async function ProfilePage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const ctx = await requireStudio("/studio/profile", sp.org);
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("studio_authors", { p_org: ctx.org.id });
  if (error) console.error("studio_authors_failed", error.code ?? "");
  const rows = (data ?? []) as AuthorRow[];
  const can = roleCan(ctx.org.role);
  // Your own profile; a sole author's organisation has just the one.
  const me = rows.find((r) => r.is_me) ?? (ctx.org.kind === "individual" && can.writeBooks ? rows[0] : undefined);
  const editable = me ? me.can_edit : can.writeBooks;

  return (
    <div className="admin-page studio-page">
      <OrgSwitcher ctx={ctx} path="/studio/profile" />
      <h1>Your profile</h1>
      <StudioNotice code={sp.notice} />

      {!me && !can.writeBooks ? (
        <p className="admin-note">Your organisation keeps your author profile. Ask an owner or editor to add you to the roster and invite you to it.</p>
      ) : (
        <>
          <section className="card admin-create" aria-labelledby="p-h">
            <h2 id="p-h">Names and links</h2>
            <form className="admin-form" action={saveProfile}>
              <fieldset disabled={!editable}>
                <legend className="admin-vh">Profile</legend>
                <input type="hidden" name="org" value={ctx.org.id} />
                {me ? <input type="hidden" name="author" value={me.id} /> : null}
                <label htmlFor="p-display">Name readers see (pen name)</label>
                <input id="p-display" name="display_name" maxLength={120} required defaultValue={me?.display_name ?? ""} />
                <label htmlFor="p-legal">Legal name</label>
                <input id="p-legal" name="legal_name" maxLength={200} defaultValue={me?.legal_name ?? ""} aria-describedby="p-legal-h" />
                <p id="p-legal-h" className="muted small">
                  For contracts and statements only. Never shown to readers.
                </p>
                <label htmlFor="p-country">Country code</label>
                <input id="p-country" name="country" maxLength={2} placeholder="GB" defaultValue={me?.country ?? ""} autoCapitalize="characters" />
                <label htmlFor="p-site">Website</label>
                <input id="p-site" name="website" type="url" maxLength={300} placeholder="https://" defaultValue={me?.website ?? ""} />
                <label htmlFor="p-links">Other links, one per line (up to five)</label>
                <textarea id="p-links" name="links" rows={3} defaultValue={(me?.links ?? []).join("\n")} />
                <label htmlFor="p-spell">Spelling in your workbooks</label>
                <select id="p-spell" name="spelling" defaultValue={me?.spelling ?? "en-GB"}>
                  <option value="en-GB">British English</option>
                  <option value="en-US">American English</option>
                </select>
                <label className="check">
                  <input type="checkbox" name="photo_rights" value="yes" defaultChecked={Boolean(me?.photo_rights_confirmed_at)} />
                  <span>I hold the rights to the author photo I send, or have permission to use it.</span>
                </label>
                <button type="submit" className="btn">
                  Save
                </button>
              </fieldset>
            </form>
          </section>

          {me ? (
            <section className="card admin-create" aria-labelledby="b-h">
              <h2 id="b-h">Short bio</h2>
              <p className="muted">{BIO_STATUS[me.bio_status] ?? ""}</p>
              {me.bio_status === "pending" && me.bio_flags.length > 0 ? (
                <div className="admin-note">
                  <p>These phrases were flagged for the team. Bios cannot promise health results or guaranteed outcomes.</p>
                  <ul>
                    {me.bio_flags.map((f, i) => (
                      <li key={i}>{f.phrase}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <form className="admin-form" action={submitBio}>
                <fieldset disabled={!me.can_edit}>
                  <legend className="admin-vh">Bio</legend>
                  <input type="hidden" name="org" value={ctx.org.id} />
                  <input type="hidden" name="author" value={me.id} />
                  <label htmlFor="b-bio">Bio, up to 1,200 characters</label>
                  <textarea id="b-bio" name="bio" rows={6} maxLength={1200} required defaultValue={me.bio_draft ?? me.bio ?? ""} />
                  <p className="muted small">Write about you and your work. Leave out claims that a book cures, treats or guarantees anything.</p>
                  <button type="submit" className="btn">
                    Send for approval
                  </button>
                </fieldset>
              </form>
            </section>
          ) : (
            <p className="admin-note">Save your names first. Then you can write your bio.</p>
          )}
        </>
      )}
    </div>
  );
}
