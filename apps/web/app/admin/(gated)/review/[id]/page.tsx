import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatAdminDate, isUuid } from "@/lib/admin/leads";
import { adminAbilities } from "@/lib/admin/permissions";
import {
  REVIEWER_TRADITIONS,
  SIGNOFF_LABELS,
  TRADITION_LABELS,
  TRADITION_NAMES,
  ageInDays,
  ageLabel,
  requirementLabel,
  reviewStatusLabel,
  runValidator,
  shortHash,
  signoffKindsFor,
  traditionLine,
  unmetRequirements,
  type Requirement,
  type SignoffKind,
} from "@/lib/admin/review";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { AdminBack } from "../../_components/Bits";
import { Notice } from "../../_components/Notice";
import {
  addReviewNote,
  approveOverride,
  assignReview,
  recordSignoff,
  releaseVersion,
  requestOverride,
  sendBack,
  setLicenceRecord,
} from "../actions";

export const metadata: Metadata = { title: "Review", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Findings shown per list. The counts are always the full counts. */
const FINDINGS_SHOWN = 200;

interface VersionRow {
  id: string;
  workbook_id: string;
  semver: string;
  content: unknown;
  content_hash: string;
  created_at: string;
  published_at: string | null;
}

interface WorkbookRow {
  id: string;
  code: string;
  title: string;
  status: string;
  safety_tier: string;
  genre_id: string;
  licence_ref: string | null;
}

interface SignoffRow {
  id: string;
  kind: SignoffKind;
  signer_name: string;
  reviewer_tradition: string | null;
  tradition_label: string | null;
  note: string | null;
  content_hash: string;
  recorded_at: string;
}

interface NoteRow {
  id: string;
  kind: string;
  body: string;
  created_at: string;
  author: string | null;
}

interface OverrideRow {
  id: string;
  unmet: string[];
  reason: string;
  content_hash: string;
  requested_by: string;
  requested_at: string;
  approved_by: string | null;
  approved_at: string | null;
  used_at: string | null;
}

/**
 * One version under review (F-084, F-085, F-155): validator findings run on
 * the server against this version's JSON, the release requirements, the
 * sign-offs against its content hash, reviewer notes, assignment, and the
 * release with the two-person override. Reader answers are never read.
 */
export default async function ReviewVersionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const staff = await getStaffSession("/admin/review");
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const can = adminAbilities(staff.roles);
  if (!can.readReviewQueue) notFound();

  const supabase = await createUserClient();
  const { data: vData, error: vError } = await supabase
    .from("workbook_versions")
    .select("id, workbook_id, semver, content, content_hash, created_at, published_at")
    .eq("id", id)
    .maybeSingle();
  if (vError) console.error("admin_review_version_failed", vError.code ?? "");
  if (!vData) notFound();
  const v = vData as VersionRow;

  const [wbRes, reqRes, signRes, noteRes, ovrRes, assignRes, staffRes] = await Promise.all([
    supabase.from("workbooks").select("id, code, title, status, safety_tier, genre_id, licence_ref").eq("id", v.workbook_id).maybeSingle(),
    supabase.rpc("release_requirements", { p_version: v.id }),
    supabase
      .from("release_signoffs")
      .select("id, kind, signer_name, reviewer_tradition, tradition_label, note, content_hash, recorded_at")
      .eq("version_id", v.id)
      .order("recorded_at", { ascending: true }),
    supabase.from("review_notes").select("id, kind, body, created_at, author").eq("version_id", v.id).order("created_at", { ascending: true }),
    supabase
      .from("release_overrides")
      .select("id, unmet, reason, content_hash, requested_by, requested_at, approved_by, approved_at, used_at")
      .eq("version_id", v.id)
      .order("requested_at", { ascending: false }),
    supabase.from("review_assignments").select("assignee, assigned_at").eq("version_id", v.id).maybeSingle(),
    supabase.rpc("review_staff"),
  ]);
  for (const [tag, r] of [
    ["workbook", wbRes],
    ["requirements", reqRes],
    ["signoffs", signRes],
    ["notes", noteRes],
    ["overrides", ovrRes],
    ["assignment", assignRes],
    ["staff", staffRes],
  ] as const) {
    if (r.error) console.error(`admin_review_${tag}_failed`, r.error.code ?? "");
  }
  if (!wbRes.data) notFound();
  const w = wbRes.data as WorkbookRow;

  // The validator, on the server, against this version's JSON.
  const result = runValidator(v.content);
  {
    const { error } = await supabase.rpc("record_validation", {
      p_version: v.id,
      p_content_hash: v.content_hash,
      p_ok: result.ok,
      p_errors: result.errors.length,
      p_warnings: result.warnings.length,
    });
    if (error) console.error("admin_review_record_validation_failed", error.code ?? "");
  }
  // Read the requirements after recording, so the validator line is current.
  const { data: reqAfter } = await supabase.rpc("release_requirements", { p_version: v.id });
  const requirements = ((reqAfter ?? reqRes.data ?? []) as Requirement[]).filter((r) => r.required);
  const unmet = unmetRequirements(requirements);

  const signoffs = (signRes.data ?? []) as SignoffRow[];
  const notes = (noteRes.data ?? []) as NoteRow[];
  const overrides = (ovrRes.data ?? []) as OverrideRow[];
  const staffList = (staffRes.data ?? []) as { user_id: string; email: string | null; roles: string[] }[];
  const emailOf = (uid: string | null) => (uid ? staffList.find((s) => s.user_id === uid)?.email || "A member of staff" : "");
  const assignment = assignRes.data as { assignee: string; assigned_at: string } | null;
  const kinds = signoffKindsFor(staff.roles);
  const needsTheology = requirements.some((r) => r.requirement === "theological");
  const usableOverride = overrides.find(
    (o) => o.approved_by && !o.used_at && o.content_hash === v.content_hash && unmet.every((u) => o.unmet.includes(u)),
  );
  const pendingOverrides = overrides.filter((o) => !o.approved_by && !o.used_at && o.content_hash === v.content_hash);
  const isLive = w.status === "live";

  return (
    <div className="admin-page">
      <AdminBack href="/admin/review" label="Review queue" />
      <h1>
        <code>{w.code}</code> {w.title}
      </h1>
      <p>
        <span className={`badge admin-wb admin-wb-${w.status}`}>{reviewStatusLabel(w.status)}</span> Version {v.semver}, in the queue{" "}
        {ageLabel(ageInDays(v.created_at)).toLowerCase()}. Content hash <code>{shortHash(v.content_hash)}</code>.
        {v.published_at ? " This version is published." : ""}
      </p>
      <Notice code={sp.notice} />

      <section aria-labelledby="gate-h" className="card review-gate">
        <h2 id="gate-h">Release gate</h2>
        <ul className="review-reqs">
          {requirements.map((r) => (
            <li key={r.requirement} className={r.met ? "is-met" : "is-unmet"}>
              <span className="review-req-mark" aria-hidden="true">
                {r.met ? "Met" : "Missing"}
              </span>
              <span>
                {requirementLabel(r.requirement)}
                <span className="admin-vh">{r.met ? ": met" : ": missing"}</span>
              </span>
            </li>
          ))}
        </ul>
        {can.releaseVersions ? (
          <div className="admin-actions">
            {!isLive ? (
              <form action={releaseVersion}>
                <input type="hidden" name="version" value={v.id} />
                <input type="hidden" name="go_live" value="0" />
                {usableOverride && unmet.length ? <input type="hidden" name="override" value={usableOverride.id} /> : null}
                <button type="submit" className="btn secondary" disabled={unmet.length > 0 && !usableOverride}>
                  Approve
                </button>
              </form>
            ) : null}
            <form action={releaseVersion}>
              <input type="hidden" name="version" value={v.id} />
              <input type="hidden" name="go_live" value="1" />
              {usableOverride && unmet.length ? <input type="hidden" name="override" value={usableOverride.id} /> : null}
              <button type="submit" className="btn" disabled={unmet.length > 0 && !usableOverride}>
                {isLive ? "Publish this version" : "Go live"}
              </button>
            </form>
          </div>
        ) : (
          <p className="muted">Owners and editors release a version.</p>
        )}
        {unmet.length && usableOverride ? (
          <p className="admin-note">An approved override covers what is missing. Releasing uses it, once, and the audit log names both people.</p>
        ) : unmet.length ? (
          <p className="muted">Release is refused until everything above is met, or two members of staff approve an override.</p>
        ) : null}
      </section>

      <section aria-labelledby="val-h">
        <h2 id="val-h">Validator</h2>
        <p>
          {result.ok ? <span className="badge review-pass">Pass</span> : <span className="badge review-fail">Fail</span>} {result.errors.length} error
          {result.errors.length === 1 ? "" : "s"}, {result.warnings.length} warning{result.warnings.length === 1 ? "" : "s"}. Run just now on this version.
        </p>
        {[
          { title: "Errors", list: result.errors },
          { title: "Warnings", list: result.warnings },
        ].map(({ title, list }) =>
          list.length ? (
            <details key={title} className="review-findings" open={title === "Errors"}>
              <summary>
                {title} ({list.length})
              </summary>
              <ul>
                {list.slice(0, FINDINGS_SHOWN).map((f, i) => (
                  <li key={i}>
                    <span className="badge">{f.category}</span> {f.path ? <code>{f.path}</code> : null} {f.message}
                    {f.excerpt ? <span className="muted"> {f.excerpt}</span> : null}
                  </li>
                ))}
              </ul>
              {list.length > FINDINGS_SHOWN ? <p className="muted">Showing the first {FINDINGS_SHOWN}.</p> : null}
            </details>
          ) : null,
        )}
      </section>

      <section aria-labelledby="sign-h">
        <h2 id="sign-h">Sign-offs</h2>
        {signoffs.length === 0 ? (
          <p className="muted">No sign-offs yet.</p>
        ) : (
          <ul className="review-list">
            {signoffs.map((s) => (
              <li key={s.id} className={s.content_hash === v.content_hash ? "" : "is-stale"}>
                <strong>{SIGNOFF_LABELS[s.kind] ?? s.kind}</strong>: {s.signer_name}, {formatAdminDate(s.recorded_at)}
                {s.reviewer_tradition ? `. Reviewer tradition: ${TRADITION_NAMES[s.reviewer_tradition as keyof typeof TRADITION_NAMES] ?? s.reviewer_tradition}` : ""}
                {s.tradition_label && (TRADITION_LABELS as readonly string[]).includes(s.tradition_label)
                  ? `. Approved line: "${traditionLine(s.tradition_label as (typeof TRADITION_LABELS)[number])}"`
                  : ""}
                {s.note ? <span className="muted">. {s.note}</span> : null}
                {s.content_hash === v.content_hash ? null : <span className="muted"> (earlier content, does not count)</span>}
              </li>
            ))}
          </ul>
        )}

        {kinds.length ? (
          <form action={recordSignoff} className="admin-form review-form">
            <input type="hidden" name="version" value={v.id} />
            <h3>Record a sign-off</h3>
            <p className="muted small">It is recorded against content hash {shortHash(v.content_hash)}. A later change to the content needs a new sign-off.</p>
            <label htmlFor="so-kind">Kind</label>
            <select id="so-kind" name="kind" required>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {SIGNOFF_LABELS[k]}
                </option>
              ))}
            </select>
            <label htmlFor="so-name">Name of the person signing</label>
            <input id="so-name" name="signer_name" type="text" maxLength={200} required />
            {needsTheology || kinds.includes("theological") ? (
              <fieldset className="review-fieldset">
                <legend>Theological sign-off only</legend>
                <label htmlFor="so-rt">Reviewer&apos;s own tradition</label>
                <select id="so-rt" name="reviewer_tradition" defaultValue="">
                  <option value="">Not a theological sign-off</option>
                  {REVIEWER_TRADITIONS.map((t) => (
                    <option key={t} value={t}>
                      {TRADITION_NAMES[t]}
                    </option>
                  ))}
                </select>
                <label htmlFor="so-tl">Tradition label the reviewer approves</label>
                <select id="so-tl" name="tradition_label" defaultValue="">
                  <option value="">Not a theological sign-off</option>
                  {TRADITION_LABELS.map((t) => (
                    <option key={t} value={t}>
                      {TRADITION_NAMES[t]}
                    </option>
                  ))}
                </select>
                <p className="muted small">
                  The reviewer approves the line readers see: &ldquo;Written from within the [tradition] tradition. Readers from other churches are
                  welcome.&rdquo; A title labelled for one tradition needs a reviewer from that tradition.
                </p>
              </fieldset>
            ) : null}
            <label htmlFor="so-note">Note (optional)</label>
            <input id="so-note" name="note" type="text" maxLength={500} />
            <div className="admin-actions">
              <button type="submit" className="btn">
                Record sign-off
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <section aria-labelledby="lic-h">
        <h2 id="lic-h">Licence record</h2>
        <p>{w.licence_ref ? <code>{w.licence_ref}</code> : <span className="muted">No licence or public-domain record yet.</span>}</p>
        {can.releaseVersions ? (
          <form action={setLicenceRecord} className="admin-form review-form">
            <input type="hidden" name="version" value={v.id} />
            <input type="hidden" name="workbook" value={w.id} />
            <label htmlFor="lic-ref">Licence reference, or the public-domain record</label>
            <p id="lic-hint" className="muted small">
              For a classic, use the house record, for example public-domain:/public-domain/{w.code}.
            </p>
            <input id="lic-ref" name="licence_ref" type="text" maxLength={300} required aria-describedby="lic-hint" defaultValue={w.licence_ref ?? ""} />
            <div className="admin-actions">
              <button type="submit" className="btn secondary">
                Save licence record
              </button>
            </div>
          </form>
        ) : null}
      </section>

      {can.releaseVersions ? (
        <section aria-labelledby="ovr-h">
          <h2 id="ovr-h">Two-person override</h2>
          <p className="muted">
            For a release that cannot meet every requirement. One member of staff asks with a reason, a different one approves. It covers this content only, once,
            for 7 days.
          </p>
          {overrides.length ? (
            <ul className="review-list">
              {overrides.map((o) => (
                <li key={o.id}>
                  Asked by {emailOf(o.requested_by)} on {formatAdminDate(o.requested_at)} for: {o.unmet.map(requirementLabel).join(", ")}. Reason: {o.reason}.{" "}
                  {o.used_at
                    ? `Used ${formatAdminDate(o.used_at)}.`
                    : o.approved_by
                      ? `Approved by ${emailOf(o.approved_by)}.`
                      : o.content_hash !== v.content_hash
                        ? "The content has changed since, so it cannot be used."
                        : "Waiting for a second member of staff."}
                </li>
              ))}
            </ul>
          ) : null}
          {pendingOverrides
            .filter((o) => o.requested_by !== staff.userId)
            .map((o) => (
              <form key={o.id} action={approveOverride} className="admin-actions">
                <input type="hidden" name="version" value={v.id} />
                <input type="hidden" name="override" value={o.id} />
                <button type="submit" className="btn help">
                  Approve the override asked for by {emailOf(o.requested_by)}
                </button>
              </form>
            ))}
          {unmet.length && !usableOverride && pendingOverrides.length === 0 ? (
            <form action={requestOverride} className="admin-form review-form">
              <input type="hidden" name="version" value={v.id} />
              <label htmlFor="ovr-reason">Reason for the override</label>
              <p id="ovr-hint" className="muted small">
                Kept in the audit log with your name. Missing now: {unmet.map(requirementLabel).join(", ")}.
              </p>
              <textarea id="ovr-reason" name="reason" maxLength={1000} required rows={3} aria-describedby="ovr-hint" />
              <div className="admin-actions">
                <button type="submit" className="btn secondary">
                  Ask for an override
                </button>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="who-h">
        <h2 id="who-h">Assignee</h2>
        <p>{assignment ? `${emailOf(assignment.assignee)}, since ${formatAdminDate(assignment.assigned_at)}.` : "Nobody is assigned yet."}</p>
        {can.releaseVersions && staffList.length ? (
          <form action={assignReview} className="admin-form review-form">
            <input type="hidden" name="version" value={v.id} />
            <label htmlFor="as-who">Assign to</label>
            <select id="as-who" name="assignee" defaultValue={assignment?.assignee ?? ""} required>
              <option value="" disabled>
                Choose a reviewer
              </option>
              {staffList.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.email}
                </option>
              ))}
            </select>
            <div className="admin-actions">
              <button type="submit" className="btn secondary">
                Assign and email them
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <section aria-labelledby="notes-h">
        <h2 id="notes-h">Notes</h2>
        {notes.length === 0 ? (
          <p className="muted">No notes yet.</p>
        ) : (
          <ul className="review-list">
            {notes.map((n) => (
              <li key={n.id}>
                <strong>{n.kind === "send_back" ? "Sent back" : "Comment"}</strong> by {emailOf(n.author)}, {formatAdminDate(n.created_at)}:{" "}
                <span className="admin-message">{n.body}</span>
              </li>
            ))}
          </ul>
        )}
        <form action={addReviewNote} className="admin-form review-form">
          <input type="hidden" name="version" value={v.id} />
          <label htmlFor="note-body">Add a comment</label>
          <textarea id="note-body" name="body" maxLength={2000} required rows={3} />
          <div className="admin-actions">
            <button type="submit" className="btn secondary">
              Add comment
            </button>
          </div>
        </form>
        {!v.published_at ? (
          <form action={sendBack} className="admin-form review-form">
            <input type="hidden" name="version" value={v.id} />
            <label htmlFor="sb-reason">Send back with a reason</label>
            <p id="sb-hint" className="muted small">
              The author sees this reason. A workbook that is not on sale goes back to draft.
            </p>
            <textarea id="sb-reason" name="reason" maxLength={2000} required rows={3} aria-describedby="sb-hint" />
            <div className="admin-actions">
              <button type="submit" className="btn help">
                Send back
              </button>
            </div>
          </form>
        ) : null}
      </section>
    </div>
  );
}
