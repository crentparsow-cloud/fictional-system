import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrivateFileUpload } from "@/components/files/PrivateFileUpload";
import { StudioNotice } from "@/components/studio/StudioBits";
import { isUuid, roleCan, SUBMISSION_FILE_KINDS, SUBMISSION_ROUTES, withOrg } from "@/lib/studio";
import { requireStudio } from "@/lib/studio-server";
import { createUserClient } from "@/lib/supabase/server";
import { createSubmission } from "../../../actions";

export const metadata: Metadata = { title: "Submit a workbook", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

/**
 * Submit a workbook (F-037). Route one: upload the manuscript and any
 * existing workbook to private storage with a short brief. Route two: ask
 * Akana to develop it, then get a quote and pay a deposit. Both create a
 * Draft workbook and a submission the review team picks up.
 */
export default async function SubmitPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const base = await requireStudio(`/studio/books/${id}/submit`, sp.org);
  const supabase = await createUserClient();
  const [{ data: book }, genres] = await Promise.all([
    supabase.from("books").select("id, org_id, title, genre_id").eq("id", id).maybeSingle(),
    supabase.from("genres").select("id, name").order("name"),
  ]);
  const org = book ? base.orgs.find((o) => o.id === book.org_id) : undefined;
  if (!book || !org || !roleCan(org.role).writeWorkbooks) notFound();

  return (
    <div className="admin-page studio-page">
      <p className="admin-back">
        <Link href={withOrg(`/studio/books/${id}`, org.id, base.multi)}>Back to {book.title as string}</Link>
      </p>
      <h1>Submit a workbook</h1>
      <StudioNotice code={sp.notice} />
      <p className="muted">
        Your manuscript stays private: only your organisation and Akana staff can open it, there are no public links, and it is never used to train AI.
      </p>

      <form className="admin-form studio-wide" action={createSubmission}>
        <input type="hidden" name="org" value={org.id} />
        <input type="hidden" name="book" value={id} />
        <fieldset className="studio-radios">
          <legend>How would you like to work?</legend>
          {(Object.keys(SUBMISSION_ROUTES) as (keyof typeof SUBMISSION_ROUTES)[]).map((k) => (
            <label key={k} className="check">
              <input type="radio" name="route" value={k} required defaultChecked={k === "upload"} />
              <span>
                <strong>{SUBMISSION_ROUTES[k].label}.</strong> {SUBMISSION_ROUTES[k].help}
              </span>
            </label>
          ))}
        </fieldset>
        <label htmlFor="s-title">Working title for the workbook</label>
        <input id="s-title" name="title" maxLength={200} placeholder={book.title as string} />
        <label htmlFor="s-genre">Genre</label>
        <select id="s-genre" name="genre" required defaultValue={(book.genre_id as string | null) ?? ""}>
          <option value="" disabled>
            Choose a genre
          </option>
          {((genres.data ?? []) as { id: string; name: string }[]).map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <label htmlFor="s-brief">A short brief</label>
        <textarea id="s-brief" name="brief" rows={6} maxLength={4000} required aria-describedby="s-brief-h" />
        <p id="s-brief-h" className="muted small">
          Who the workbook is for, how long it should run, and anything we should know about the book.
        </p>
        <label htmlFor="s-kind">What are you uploading?</label>
        <select id="s-kind" name="file_kind" defaultValue="manuscript">
          {Object.entries(SUBMISSION_FILE_KINDS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <PrivateFileUpload orgId={org.id} kind="manuscripts" inputName="file_path" label="File (needed for the upload route)" />
        <p className="muted small">You can add more files to the submission afterwards.</p>
        <button type="submit" className="btn">
          Submit
        </button>
      </form>
    </div>
  );
}
