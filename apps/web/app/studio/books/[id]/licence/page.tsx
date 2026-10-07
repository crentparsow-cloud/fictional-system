import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrivateFileUpload } from "@/components/files/PrivateFileUpload";
import { LicenceDraftBanner, StudioNotice } from "@/components/studio/StudioBits";
import { markdownToHtml } from "@/lib/markdown";
import { isUuid, LICENCE_DRAFT_NOTICE, licenceTextState, roleCan, withOrg } from "@/lib/studio";
import { readLicenceFile, readLicenceTextRow, requireStudio } from "@/lib/studio-server";
import { createUserClient } from "@/lib/supabase/server";
import { acceptLicence, uploadLicence } from "../../../actions";

export const metadata: Metadata = { title: "Licence", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

const DRAFT_LINE = /^DRAFT for the lawyer\..*$/m;

/** The variable terms, shared by the clickwrap and the signed upload forms. */
function TermsFields({ prefix }: { prefix: string }) {
  return (
    <>
      <label htmlFor={`${prefix}-terr`}>Territories</label>
      <input id={`${prefix}-terr`} name="territories" defaultValue="WORLD" maxLength={800} aria-describedby={`${prefix}-terr-h`} required />
      <p id={`${prefix}-terr-h`} className="muted small">
        WORLD, or two-letter country codes such as GB, IE.
      </p>
      <label htmlFor={`${prefix}-ex`}>Countries left out (optional)</label>
      <input id={`${prefix}-ex`} name="excluded" maxLength={800} />
      <label htmlFor={`${prefix}-term`}>Term, in months</label>
      <input id={`${prefix}-term`} name="term_months" inputMode="numeric" maxLength={3} required />
      <label htmlFor={`${prefix}-exc`}>Months of exclusivity (optional, 0 for none)</label>
      <input id={`${prefix}-exc`} name="exclusive_months" inputMode="numeric" maxLength={3} />
      {(
        [
          ["subscription", "May the workbook be included in Akana membership?"],
          ["cover", "May Akana show the book cover?"],
          ["audio", "May Akana make audio of the workbook text?"],
        ] as const
      ).map(([name, q]) => (
        <fieldset key={name} className="studio-radios">
          <legend>{q}</legend>
          <label className="check">
            <input type="radio" name={name} value="yes" required />
            <span>Yes</span>
          </label>
          <label className="check">
            <input type="radio" name={name} value="no" />
            <span>No</span>
          </label>
        </fieldset>
      ))}
      <label htmlFor={`${prefix}-name`}>Your full name</label>
      <input id={`${prefix}-name`} name="signer_name" maxLength={200} required autoComplete="name" />
      <label htmlFor={`${prefix}-cap`}>Signing as</label>
      <input id={`${prefix}-cap`} name="signer_capacity" maxLength={120} required placeholder="Author and rights holder, or Director" />
    </>
  );
}

/**
 * The licence for one book (F-036). The text is the lawyer draft in
 * docs/legal/author-licence.md, versioned, with the hash of its exact
 * bytes checked against the database before anyone can sign. While the text
 * is a draft, a real organisation can read it but not sign it; a demo
 * organisation can sign it as a test that never counts.
 */
export default async function LicencePage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const base = await requireStudio(`/studio/books/${id}/licence`, sp.org);
  const supabase = await createUserClient();
  const { data: book } = await supabase.from("books").select("id, org_id, title").eq("id", id).maybeSingle();
  const org = book ? base.orgs.find((o) => o.id === book.org_id) : undefined;
  if (!book || !org) notFound();
  const can = roleCan(org.role);
  if (!can.readLicences) notFound();

  const file = readLicenceFile();
  const row = file ? await readLicenceTextRow(file.version) : null;
  const state = licenceTextState(row, file?.sha256 ?? null, org.isDemo);
  const open = state.kind === "signable" || state.kind === "demo_only";
  const html = file ? markdownToHtml(file.markdown.replace(DRAFT_LINE, "")) : "";

  return (
    <div className="admin-page studio-page">
      <p className="admin-back">
        <Link href={withOrg(`/studio/books/${id}`, org.id, base.multi)}>Back to {book.title as string}</Link>
      </p>
      <h1>Licence for {book.title as string}</h1>
      <StudioNotice code={sp.notice} />
      {state.kind === "signable" ? null : <LicenceDraftBanner />}
      <p className="muted">
        Version {file?.version ?? "unknown"}
        {row ? `, ${row.status === "approved" ? "approved" : "draft"}` : ""}.
      </p>

      {file ? (
        <article className="card legal-doc studio-licence" aria-label="Licence text" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="admin-notice admin-notice-error" role="alert">
          The licence text could not be loaded.
        </p>
      )}

      {state.kind === "mismatch" ? (
        <p className="admin-notice admin-notice-error" role="alert">
          The licence text on file does not match its recorded version, so signing is closed. Akana has to publish it as a new version.
        </p>
      ) : null}
      {state.kind === "demo_only" ? (
        <p className="admin-note">This is a demo organisation. You can sign the draft as a test. A test signature never counts as a licence.</p>
      ) : null}

      {can.signLicences ? (
        <>
          <section className="card admin-create" aria-labelledby="cw-h">
            <h2 id="cw-h">Sign online</h2>
            {!open ? <p className="admin-note">{LICENCE_DRAFT_NOTICE}</p> : null}
            <form className="admin-form" action={acceptLicence}>
              <fieldset disabled={!open}>
                <legend className="admin-vh">Licence terms and signature</legend>
                <input type="hidden" name="org" value={org.id} />
                <input type="hidden" name="book" value={id} />
                <input type="hidden" name="version" value={file?.version ?? ""} />
                <input type="hidden" name="sha" value={file?.sha256 ?? ""} />
                <TermsFields prefix="cw" />
                <fieldset className="studio-radios">
                  <legend>Your promises</legend>
                  <label className="check">
                    <input type="checkbox" name="warrant_rights" value="yes" required />
                    <span>I hold the rights needed to grant this licence, or I am authorised by the person who does.</span>
                  </label>
                  <label className="check">
                    <input type="checkbox" name="warrant_no_clash" value="yes" required />
                    <span>This does not clash with a publishing contract, KDP Select or any other exclusive deal for the book.</span>
                  </label>
                  <label className="check">
                    <input type="checkbox" name="warrant_no_claims" value="yes" required />
                    <span>I will not make health, medical or guaranteed-result claims about the workbook in my own marketing.</span>
                  </label>
                </fieldset>
                <p className="muted small">Pressing the button signs the licence above. We record the version, your name, the time and a protected form of your IP address.</p>
                <button type="submit" className="btn">
                  Sign the licence
                </button>
              </fieldset>
            </form>
          </section>

          <section className="card admin-create" aria-labelledby="up-h">
            <h2 id="up-h">Or upload a signed copy</h2>
            <p className="muted">For publishers who sign on paper. Akana checks the copy before it counts.</p>
            {!open ? <p className="admin-note">{LICENCE_DRAFT_NOTICE}</p> : null}
            {open ? (
              <form className="admin-form" action={uploadLicence}>
                <input type="hidden" name="org" value={org.id} />
                <input type="hidden" name="book" value={id} />
                <PrivateFileUpload orgId={org.id} kind="licences" inputName="licence_path" label="Signed licence (PDF)" />
                <TermsFields prefix="up" />
                <button type="submit" className="btn secondary">
                  Send the signed copy
                </button>
              </form>
            ) : null}
          </section>
        </>
      ) : (
        <p className="admin-note">Only an owner of {org.displayName} can sign a licence.</p>
      )}
    </div>
  );
}
