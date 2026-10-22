import type { Metadata } from "next";
import { adminAbilities } from "@/lib/admin/permissions";
import { dateToLondonLocal, exerciseParagraphs, READINESS_WORDS, sendReadiness, signupReadiness } from "@/lib/newsletter";
import type { IssueFormValues } from "@/lib/newsletter-form";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { renderNewsletter } from "@akana/emails";
import { siteOrigin } from "@/lib/site-url";
import { AdminBack } from "../_components/Bits";
import { cancelIssue } from "./actions";
import { IssueForm } from "./IssueForm";

export const metadata: Metadata = { title: "Newsletter", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

const NOTICES: Record<string, { tone: "ok" | "error"; text: string }> = {
  cancelled: { tone: "ok", text: "Issue cancelled." },
  denied: { tone: "error", text: "Your role cannot do that. Nothing changed." },
  invalid: { tone: "error", text: "That request was not valid. Nothing changed." },
  sending: { tone: "error", text: "That issue is already going out and cannot be cancelled." },
  failed: { tone: "error", text: "The change did not save. Try again." },
};

interface IssueRow {
  id: string;
  subject: string;
  preheader: string;
  intro: string;
  exercise_heading: string;
  exercise_body: string;
  sponsor_name: string | null;
  sponsor_text: string | null;
  sponsor_url: string | null;
  scheduled_for: string | null;
  status: "draft" | "scheduled" | "sending" | "sent" | "cancelled";
  sent_at: string | null;
  sent_count: number;
  failed_count: number;
}

const when = (s: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(new Date(s));
const STATUS: Record<IssueRow["status"], string> = { draft: "Draft", scheduled: "Scheduled", sending: "Sending", sent: "Sent", cancelled: "Cancelled" };

function toValues(r: IssueRow): IssueFormValues {
  return {
    id: r.id,
    subject: r.subject,
    preheader: r.preheader,
    intro: r.intro,
    exercise_heading: r.exercise_heading,
    exercise_body: r.exercise_body,
    sponsor_name: r.sponsor_name ?? "",
    sponsor_text: r.sponsor_text ?? "",
    sponsor_url: r.sponsor_url ?? "",
    send_at: dateToLondonLocal(r.scheduled_for),
  };
}

/** The plain text of the email as a subscriber gets it, for the preview. Placeholders stand in for the personal links. */
function preview(r: IssueRow): string {
  try {
    const origin = siteOrigin();
    return renderNewsletter(
      "newsletter_issue",
      {
        appUrl: origin,
        subject: r.subject,
        preheader: r.preheader,
        intro: r.intro,
        exerciseHeading: r.exercise_heading,
        exerciseParagraphs: exerciseParagraphs(r.exercise_body),
        ...(r.sponsor_name && r.sponsor_text && r.sponsor_url ? { sponsor: { name: r.sponsor_name, text: r.sponsor_text, url: r.sponsor_url } } : {}),
      },
      { unsubscribe: `${origin}/newsletter/unsubscribe`, oneClick: `${origin}/api/newsletter/unsubscribe` },
      "[postal address]",
    ).text;
  } catch {
    return "The preview could not be built. Check the sponsor link.";
  }
}

/**
 * The weekly newsletter (6.11). Owners and editors write, schedule and
 * cancel issues; support can read the counts. The page shows whether the
 * sending settings are complete, because nothing sends while they are not.
 * It shows counts of sign-ups and never an address.
 */
export default async function AdminNewsletterPage({ searchParams }: { searchParams: Promise<Search> }) {
  const staff = await getStaffSession("/admin/newsletter");
  const sp = await searchParams;
  const can = adminAbilities(staff.roles).curateCatalogue;
  const supabase = await createUserClient();
  const [issues, stats] = await Promise.all([
    supabase
      .from("newsletter_issues")
      .select("id, subject, preheader, intro, exercise_heading, exercise_body, sponsor_name, sponsor_text, sponsor_url, scheduled_for, status, sent_at, sent_count, failed_count")
      .order("created_at", { ascending: false })
      .limit(60),
    supabase.rpc("newsletter_stats"),
  ]);
  const rows = (issues.data ?? []) as IssueRow[];
  const counts = ((stats.data ?? []) as { pending: number; confirmed: number; unsubscribed: number }[])[0];
  const signup = signupReadiness();
  const send = sendReadiness();
  const noticeCode = Array.isArray(sp.notice) ? sp.notice[0] : sp.notice;
  const notice = noticeCode ? NOTICES[noticeCode] : undefined;

  return (
    <div className="admin-page">
      <AdminBack />
      <h1>Newsletter</h1>
      {notice ? (
        <p className={`admin-notice admin-notice-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
          {notice.text}
        </p>
      ) : null}
      {!can ? <p className="muted">Only owners and editors write the newsletter. You can read it.</p> : null}

      <section className="card admin-create" aria-labelledby="nl-state">
        <h2 id="nl-state">Sending settings</h2>
        <ul>
          <li>Sign-up form: {signup.ok ? "open." : `closed. ${READINESS_WORDS[signup.reason]}`}</li>
          <li>Issues: {send.ok ? "will send on their day." : `held. ${READINESS_WORDS[send.reason]}`}</li>
        </ul>
        {counts ? (
          <p>
            <strong>{counts.confirmed}</strong> confirmed, <strong>{counts.pending}</strong> waiting to confirm, <strong>{counts.unsubscribed}</strong> unsubscribed.
          </p>
        ) : (
          <p className="muted">Counts unavailable to your role.</p>
        )}
        <p className="muted small">An issue never names a workbook title. The form refuses text that does. Sponsored blocks are labelled in the email.</p>
      </section>

      {can ? (
        <section className="card admin-create" aria-labelledby="nl-new">
          <h2 id="nl-new">New issue</h2>
          <IssueForm />
        </section>
      ) : null}

      <h2>Issues</h2>
      {rows.length === 0 ? <p className="muted">None yet.</p> : null}
      {rows.map((r) => {
        const open = r.status === "draft" || r.status === "scheduled";
        return (
          <article key={r.id} className="card admin-create">
            <h3>
              {r.subject} <span className="badge">{STATUS[r.status]}</span>
            </h3>
            <p className="muted small">
              {r.status === "sent" && r.sent_at
                ? `Sent ${when(r.sent_at)} to ${r.sent_count}${r.failed_count ? `, ${r.failed_count} could not be delivered` : ""}.`
                : r.scheduled_for
                  ? `Send time ${when(r.scheduled_for)}.`
                  : "No send time yet."}
            </p>
            <details>
              <summary>Preview the text</summary>
              <pre className="small" style={{ whiteSpace: "pre-wrap" }}>
                {preview(r)}
              </pre>
            </details>
            {open && can ? (
              <>
                <details>
                  <summary>Edit</summary>
                  <IssueForm initial={toValues(r)} />
                </details>
                <form action={cancelIssue}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="btn secondary" type="submit">
                    Cancel this issue
                  </button>
                </form>
              </>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
