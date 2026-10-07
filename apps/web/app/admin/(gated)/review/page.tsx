import type { Metadata } from "next";
import Link from "next/link";
import { formatAdminDate } from "@/lib/admin/leads";
import { adminAbilities } from "@/lib/admin/permissions";
import {
  ageInDays,
  ageLabel,
  inReviewQueue,
  reviewStatusLabel,
  runValidator,
  versionUnderReview,
  type QueueVersion,
  type QueueWorkbook,
} from "@/lib/admin/review";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { AdminBack } from "../_components/Bits";
import { Notice } from "../_components/Notice";

export const metadata: Metadata = { title: "Review queue", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const LIMIT = 500;
/** The validator runs on at most this many versions per page load. */
const VALIDATE_CAP = 100;

interface Assignment {
  version_id: string;
  assignee: string;
  assigned_at: string;
}

interface StaffRow {
  user_id: string;
  email: string | null;
}

/**
 * Review queue (F-084). Every workbook whose status is not draft, live,
 * paused or retired, so new statuses for author submission appear without a
 * code change. For each, the version under review: the newest unpublished
 * one. The validator (@akana/validate) runs here on the server against that
 * version's JSON, and the counts are recorded against its content hash
 * (public.record_validation). Reader answers are never read.
 */
export default async function ReviewQueuePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await getStaffSession("/admin/review");
  const sp = await searchParams;
  const can = adminAbilities(staff.roles);

  if (!can.readReviewQueue) {
    return (
      <div className="admin-page">
        <AdminBack />
        <h1>Review queue</h1>
        <p className="admin-note">The review queue is open to owners, editors and safety reviewers.</p>
      </div>
    );
  }

  const supabase = await createUserClient();
  const { data: wbData, error: wbError } = await supabase
    .from("workbooks")
    .select("id, code, title, status, safety_tier, genre_id, current_version_id")
    .order("updated_at", { ascending: true })
    .limit(LIMIT);
  if (wbError) console.error("admin_review_workbooks_failed", wbError.code ?? "");
  const queued = ((wbData ?? []) as QueueWorkbook[]).filter((w) => inReviewQueue(w.status));

  let versions: QueueVersion[] = [];
  if (queued.length) {
    const { data, error } = await supabase
      .from("workbook_versions")
      .select("id, workbook_id, semver, content_hash, created_at, published_at, validated_at")
      .in(
        "workbook_id",
        queued.map((w) => w.id),
      );
    if (error) console.error("admin_review_versions_failed", error.code ?? "");
    versions = (data ?? []) as QueueVersion[];
  }

  const rows = queued.map((w) => ({ w, v: versionUnderReview(w, versions) }));
  const versionIds = rows.flatMap((r) => (r.v ? [r.v.id] : []));

  const [assignRes, staffRes, contentRes] = await Promise.all([
    versionIds.length
      ? supabase.from("review_assignments").select("version_id, assignee, assigned_at").in("version_id", versionIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.rpc("review_staff"),
    versionIds.length
      ? supabase.from("workbook_versions").select("id, content_hash, content").in("id", versionIds.slice(0, VALIDATE_CAP))
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (assignRes.error) console.error("admin_review_assignments_failed", assignRes.error.code ?? "");
  if (staffRes.error) console.error("admin_review_staff_failed", staffRes.error.code ?? "");
  if (contentRes.error) console.error("admin_review_content_failed", contentRes.error.code ?? "");

  const assignments = new Map(((assignRes.data ?? []) as Assignment[]).map((a) => [a.version_id, a]));
  const emails = new Map(((staffRes.data ?? []) as StaffRow[]).map((s) => [s.user_id, s.email ?? ""]));

  // Validate on the server and record the counts against the hash validated.
  const results = new Map<string, { ok: boolean; errors: number; warnings: number }>();
  for (const row of (contentRes.data ?? []) as { id: string; content_hash: string; content: unknown }[]) {
    const r = runValidator(row.content);
    results.set(row.id, { ok: r.ok, errors: r.errors.length, warnings: r.warnings.length });
    const { error } = await supabase.rpc("record_validation", {
      p_version: row.id,
      p_content_hash: row.content_hash,
      p_ok: r.ok,
      p_errors: r.errors.length,
      p_warnings: r.warnings.length,
    });
    if (error) console.error("admin_review_record_validation_failed", error.code ?? "");
  }

  const now = new Date();

  // Open author submissions (0013), so a new one is seen before it has a version (F-086 starts it).
  const { data: subData, error: subError } = await supabase
    .from("workbook_submissions")
    .select("id, status, submitted_at, workbooks(code, title)")
    .in("status", ["submitted", "accepted", "quoted", "deposit_paid", "changes_requested"])
    .order("submitted_at", { ascending: true })
    .limit(100);
  if (subError) console.error("admin_review_submissions_failed", subError.code ?? "");
  const submissions = (subData ?? []) as unknown as { id: string; status: string; submitted_at: string; workbooks: { code: string; title: string } | null }[];

  return (
    <div className="admin-page">
      <AdminBack />
      <h1>Review queue</h1>
      <p className="muted">
        Workbooks waiting for review, oldest first. The validator runs on each version as this page loads. Open a row to see findings, sign-offs and the release
        gate.
      </p>
      <Notice code={sp.notice} />

      {wbError ? (
        <p className="admin-notice admin-notice-error" role="alert">
          The queue could not be loaded. Try again.
        </p>
      ) : rows.length === 0 ? (
        <div className="card admin-empty">
          <h2>Nothing to review</h2>
          <p className="muted">Workbooks appear here when they are submitted or put in review.</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="admin-vh">Review queue</caption>
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Title</th>
                <th scope="col">Status</th>
                <th scope="col">Version</th>
                <th scope="col">Age</th>
                <th scope="col">Assignee</th>
                <th scope="col">Validator</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ w, v }) => {
                const a = v ? assignments.get(v.id) : undefined;
                const res = v ? results.get(v.id) : undefined;
                return (
                  <tr key={w.id}>
                    <td>
                      {v ? (
                        <Link href={`/admin/review/${v.id}`}>
                          <code>{w.code}</code>
                        </Link>
                      ) : (
                        <code>{w.code}</code>
                      )}
                    </td>
                    <td>{w.title}</td>
                    <td>
                      <span className={`badge admin-wb admin-wb-${w.status}`}>{reviewStatusLabel(w.status)}</span>
                    </td>
                    <td>{v ? v.semver : <span className="muted">No version</span>}</td>
                    <td>{v ? <span title={formatAdminDate(v.created_at)}>{ageLabel(ageInDays(v.created_at, now))}</span> : ""}</td>
                    <td>{a ? emails.get(a.assignee) || "Assigned" : <span className="muted">Nobody yet</span>}</td>
                    <td>
                      {!res ? (
                        <span className="muted">Not run</span>
                      ) : res.ok ? (
                        <span className="badge review-pass">
                          Pass{res.warnings ? `, ${res.warnings} warning${res.warnings === 1 ? "" : "s"}` : ""}
                        </span>
                      ) : (
                        <span className="badge review-fail">
                          {res.errors} error{res.errors === 1 ? "" : "s"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <section aria-labelledby="subs-h">
        <h2 id="subs-h">Open submissions</h2>
        {submissions.length === 0 ? (
          <p className="muted">No open submissions.</p>
        ) : (
          <ul className="review-list">
            {submissions.map((x) => (
              <li key={x.id}>
                <Link href={`/admin/review/submissions/${x.id}`}>{x.workbooks ? <code>{x.workbooks.code}</code> : "Submission"}</Link> {x.workbooks?.title}.{" "}
                <span className="muted">
                  {x.status.replace(/_/g, " ")}, sent {formatAdminDate(x.submitted_at)}.
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {versionIds.length > VALIDATE_CAP ? (
        <p className="admin-note">The validator ran on the first {VALIDATE_CAP} versions. Open a row to run it on the rest.</p>
      ) : null}
    </div>
  );
}
