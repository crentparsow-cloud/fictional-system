import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReleaseNoticeLine } from "@/components/studio/ReleaseBits";
import { isUuid } from "@/lib/author-release";
import { OPTION_MAX, OPTIONS_MAX, QUESTION_MAX, resultsView, type ResultRow } from "@/lib/programme-question";
import { roleCan, withOrg } from "@/lib/studio";
import { requireStudio } from "@/lib/studio-server";
import { createUserClient } from "@/lib/supabase/server";
import { saveProgrammeQuestion } from "./actions";

export const metadata: Metadata = { title: "End-of-programme question", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

/**
 * The one optional question at the end of a programme (build list 8.5). The
 * author writes it with two to five fixed answers. A reader sees it once they
 * finish and may skip it. The author sees totals only, and only once ten or
 * more readers have answered; smaller counts are hidden in the database. No
 * answer is ever shown per reader.
 */
export default async function QuestionPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const ctx = await requireStudio(`/studio/workbooks/${id}/question`, sp.org);
  const supabase = await createUserClient();
  const q = (p: string) => withOrg(p, ctx.org.id, ctx.multi);
  const { data: wb } = await supabase.from("workbooks").select("id, org_id, code, title, safety_tier").eq("id", id).maybeSingle();
  const w = wb as { id: string; org_id: string; code: string; title: string; safety_tier: string } | null;
  if (!w || w.org_id !== ctx.org.id) notFound();

  const [{ data: qRow }, results] = await Promise.all([
    supabase.from("programme_questions").select("question, options").eq("workbook_id", id).maybeSingle(),
    supabase.rpc("studio_programme_question_results", { p_workbook: id }),
  ]);
  const current = qRow as { question: string; options: string[] } | null;
  const view = resultsView(results.error ? [] : ((results.data ?? []) as ResultRow[]));
  const can = roleCan(ctx.org.role).writeWorkbooks;
  const offered = w.safety_tier === "none";
  const slots = Array.from({ length: OPTIONS_MAX }, (_, i) => current?.options[i] ?? "");

  return (
    <div className="admin-page studio-page">
      <p className="admin-back">
        <Link href={q(`/studio/workbooks/${w.id}`)}>Back to {w.title}</Link>
      </p>
      <h1>
        End-of-programme question <code>{w.code}</code>
      </h1>
      <ReleaseNoticeLine code={sp.notice} />
      <p className="muted">
        One optional question, shown to a reader after they finish the programme. They pick one answer, once, or skip. You see totals across readers and never who
        answered. Counts under 10 are hidden.
      </p>

      {!offered ? (
        <p className="card">This title has a safety tier, so it does not take an end-of-programme question.</p>
      ) : (
        <form action={saveProgrammeQuestion} className="admin-form studio-wide">
          <input type="hidden" name="workbook" value={w.id} />
          {ctx.multi ? <input type="hidden" name="org" value={ctx.org.id} /> : null}
          <label htmlFor="pq-q">Question</label>
          <input id="pq-q" name="question" type="text" maxLength={QUESTION_MAX} defaultValue={current?.question ?? ""} disabled={!can} />
          <fieldset>
            <legend>Answers (two to five)</legend>
            {slots.map((value, i) => (
              <div key={i}>
                <label htmlFor={`pq-o-${i}`}>Answer {i + 1}</label>
                <input id={`pq-o-${i}`} name="option" type="text" maxLength={OPTION_MAX} defaultValue={value} disabled={!can} />
              </div>
            ))}
          </fieldset>
          <p className="muted small">Changing the wording or the answers removes the answers given so far. Leave everything blank and save to remove the question.</p>
          {can ? (
            <div className="admin-actions">
              <button type="submit" className="btn">
                Save question
              </button>
            </div>
          ) : (
            <p className="muted">Owners, editors and authors in your organisation set the question.</p>
          )}
        </form>
      )}

      {current ? (
        <section className="card" aria-labelledby="pq-results">
          <h2 id="pq-results">Results</h2>
          <p>{current.question}</p>
          <p className="muted">{view.summary}</p>
          <table className="admin-table">
            <caption className="admin-vh">Answers to the end-of-programme question</caption>
            <thead>
              <tr>
                <th scope="col">Answer</th>
                <th scope="col">Readers</th>
                <th scope="col">Share</th>
              </tr>
            </thead>
            <tbody>
              {view.lines.map((l, i) => (
                <tr key={i}>
                  <td>{l.label}</td>
                  <td>{l.count}</td>
                  <td>{l.share}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
