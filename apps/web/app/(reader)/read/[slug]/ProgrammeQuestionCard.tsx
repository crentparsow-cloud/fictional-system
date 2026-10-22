import { answerProgrammeQuestion } from "./question-actions";

/**
 * The author's one optional question at the end of a programme (8.5). Fixed
 * answers, one tap each. The author only ever sees totals, and only once ten
 * or more readers have answered. Leaving it alone is fine: there is no nag and
 * nothing is recorded for a skip.
 */
export function ProgrammeQuestionCard({ enrolmentId, slug, question, options }: { enrolmentId: string; slug: string; question: string; options: string[] }) {
  return (
    <section className="card programme-question" aria-labelledby="pq-h">
      <h2 id="pq-h" className="programme-question-title">
        One question, if you would like to answer
      </h2>
      <p>{question}</p>
      <form action={answerProgrammeQuestion} className="programme-question-form">
        <input type="hidden" name="enrolment" value={enrolmentId} />
        <input type="hidden" name="slug" value={slug} />
        <div className="programme-question-options">
          {options.map((label, i) => (
            <button key={i} type="submit" name="option" value={i} className="btn secondary">
              {label}
            </button>
          ))}
        </div>
      </form>
      <p className="muted small">The author sees only totals across many readers, never who answered. You can ignore this.</p>
    </section>
  );
}
