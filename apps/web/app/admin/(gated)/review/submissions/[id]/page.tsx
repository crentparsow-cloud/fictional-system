import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatAdminDate } from "@/lib/admin/leads";
import { adminAbilities } from "@/lib/admin/permissions";
import { reviewStatusLabel } from "@/lib/admin/review";
import { isUuid, shortHash } from "@/lib/author-release";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { AdminBack } from "../../../_components/Bits";
import { Notice } from "../../../_components/Notice";
import { setSubmissionStatus } from "../../submission-actions";

export const metadata: Metadata = { title: "Submission", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

interface SubmissionRow {
  id: string;
  org_id: string;
  book_id: string;
  workbook_id: string;
  route: string;
  brief: string;
  status: string;
  status_reason: string | null;
  submitted_at: string;
}

const ROUTES: Record<string, string> = { upload: "Upload a manuscript", develop: "Ask Akana to develop it" };
const OPEN = ["submitted", "accepted", "quoted", "deposit_paid", "changes_requested"];

/**
 * One author submission (0013) for staff: the brief, the files, the
 * workbook and its versions. Accept or ask for changes, which emails the
 * organisation (F-043), and start the first version in the JSON editor
 * (F-086) when there is none. Reader answers are never read.
 */
export default async function SubmissionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const staff = await getStaffSession(`/admin/review/submissions/${id}`);
  if (!isUuid(id)) notFound();
  const can = adminAbilities(staff.roles);
  if (!can.readReviewQueue) notFound();
  const supabase = await createUserClient();
  const { data } = await supabase
    .from("workbook_submissions")
    .select("id, org_id, book_id, workbook_id, route, brief, status, status_reason, submitted_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const s = data as SubmissionRow;
  const [wbRes, orgRes, bookRes, filesRes, versionsRes] = await Promise.all([
    supabase.from("workbooks").select("id, code, title, status").eq("id", s.workbook_id).maybeSingle(),
    supabase.from("organisations").select("display_name").eq("id", s.org_id).maybeSingle(),
    supabase.from("books").select("title").eq("id", s.book_id).maybeSingle(),
    supabase.from("submission_files").select("id, kind, file_name, storage_path, created_at").eq("submission_id", s.id).order("created_at"),
    supabase.from("workbook_versions").select("id, semver, content_hash, created_at, published_at").eq("workbook_id", s.workbook_id).order("created_at", { ascending: false }),
  ]);
  const w = wbRes.data as { id: string; code: string; title: string; status: string } | null;
  const files = (filesRes.data ?? []) as { id: string; kind: string; file_name: string; storage_path: string; created_at: string }[];
  const versions = (versionsRes.data ?? []) as { id: string; semver: string; content_hash: string; created_at: string; published_at: string | null }[];
  const open = OPEN.includes(s.status);

  return (
    <div className="admin-page">
      <AdminBack href="/admin/review" label="Review queue" />
      <h1>
        Submission: {w ? <code>{w.code}</code> : null} {w?.title ?? "Workbook"}
      </h1>
      <Notice code={sp.notice} />
      <dl className="studio-facts">
        <dt>Organisation</dt>
        <dd>{(orgRes.data as { display_name?: string } | null)?.display_name ?? "Unknown"}</dd>
        <dt>Book</dt>
        <dd>{(bookRes.data as { title?: string } | null)?.title ?? "Unknown"}</dd>
        <dt>Route</dt>
        <dd>{ROUTES[s.route] ?? s.route}</dd>
        <dt>Sent</dt>
        <dd>{formatAdminDate(s.submitted_at)}</dd>
        <dt>Submission status</dt>
        <dd>{s.status.replace(/_/g, " ")}</dd>
        <dt>Workbook status</dt>
        <dd>{w ? reviewStatusLabel(w.status) : "Unknown"}</dd>
      </dl>
      {s.status_reason ? <p className="admin-note">{s.status_reason}</p> : null}

      <section aria-labelledby="brief-h">
        <h2 id="brief-h">Brief</h2>
        <p className="admin-message">{s.brief}</p>
        {files.length ? (
          <ul className="review-list">
            {files.map((f) => (
              <li key={f.id}>
                <a href={`/files/open?path=${encodeURIComponent(f.storage_path)}`}>{f.file_name}</a> <span className="muted small">{f.kind}, {formatAdminDate(f.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No files yet.</p>
        )}
      </section>

      <section aria-labelledby="ver-h">
        <h2 id="ver-h">Versions</h2>
        {versions.length ? (
          <ul className="review-list">
            {versions.map((v) => (
              <li key={v.id}>
                <Link href={`/admin/review/${v.id}`}>Version {v.semver}</Link>, content <code>{shortHash(v.content_hash)}</code>, {formatAdminDate(v.created_at)}
                {v.published_at ? ". Published" : ""}
              </li>
            ))}
          </ul>
        ) : (
          <>
            <p className="muted">No version yet.</p>
            {can.releaseVersions && w ? (
              <p>
                <Link className="btn secondary" href={`/admin/review/start/${w.id}`}>
                  Start the first version
                </Link>
              </p>
            ) : null}
          </>
        )}
      </section>

      {can.releaseVersions && open ? (
        <section aria-labelledby="move-h">
          <h2 id="move-h">Move it on</h2>
          {s.status !== "accepted" ? (
            <form action={setSubmissionStatus} className="admin-actions">
              <input type="hidden" name="submission" value={s.id} />
              <input type="hidden" name="status" value="accepted" />
              <button type="submit" className="btn">
                Accept and email the author
              </button>
            </form>
          ) : null}
          <form action={setSubmissionStatus} className="admin-form review-form">
            <input type="hidden" name="submission" value={s.id} />
            <label htmlFor="sub-reason">Reason (the author sees it)</label>
            <textarea id="sub-reason" name="reason" maxLength={500} rows={3} required />
            <div className="admin-actions">
              <button type="submit" name="status" value="changes_requested" className="btn secondary">
                Ask for changes and email the author
              </button>
              <button type="submit" name="status" value="declined" className="btn help">
                Decline
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
