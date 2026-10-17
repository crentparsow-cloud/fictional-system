"use client";

import { useState } from "react";
import { markReviewAnswer } from "@/app/(reader)/today/actions";
import { stillTrueField } from "@/lib/today/review";

/**
 * Your own words, back again (4.3). One earlier answer with the question it
 * answered. "Still true?" is optional: yes, no or skip, and a yes or no is
 * saved as a sealed answer like any other. Keep and Set aside are soft: the
 * answer is never deleted, and a set-aside answer can be brought back from
 * You. Nothing here counts or compares days.
 */
export function ReviewPanel({
  enrolmentId,
  answerId,
  question,
  text,
  day,
  readOnly,
}: {
  enrolmentId: string;
  answerId: string;
  question: string;
  text: string;
  day: string;
  readOnly?: boolean;
}) {
  const [done, setDone] = useState<null | "answered" | "kept" | "set_aside" | "skipped">(null);
  const [error, setError] = useState(false);

  async function answer(value: "yes" | "no") {
    setError(false);
    try {
      const res = await fetch("/api/answers", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enrolment: enrolmentId, field: stillTrueField(day), value: { answer: value, answerId } }),
      });
      if (res.ok) setDone("answered");
      else setError(true);
    } catch {
      setError(true);
    }
  }

  async function mark(state: "kept" | "set_aside") {
    setError(false);
    if (await markReviewAnswer(enrolmentId, answerId, state)) setDone(state);
    else setError(true);
  }

  if (done) {
    const line =
      done === "set_aside"
        ? "Set aside. It is still saved, and it will not come back here. You can bring it back from You."
        : done === "kept"
          ? "Kept."
          : done === "answered"
            ? "Saved with your other answers."
            : "That is fine.";
    return (
      <section className="review-panel" aria-label="Your own words" role="status">
        <p className="muted">{line}</p>
      </section>
    );
  }

  return (
    <section className="review-panel" aria-labelledby="review-title">
      <h2 id="review-title" className="section-title">
        From your own words
      </h2>
      <p className="muted small">{question}</p>
      <blockquote className="review-quote">{text}</blockquote>
      {readOnly ? null : (
        <>
          <p className="small">Still true?</p>
          <div className="review-actions">
            <button type="button" className="btn secondary" onClick={() => void answer("yes")}>
              Yes
            </button>
            <button type="button" className="btn secondary" onClick={() => void answer("no")}>
              No
            </button>
            <button type="button" className="linklike" onClick={() => setDone("skipped")}>
              Skip
            </button>
          </div>
          <div className="review-actions">
            <button type="button" className="linklike" onClick={() => void mark("kept")}>
              Keep
            </button>
            <button type="button" className="linklike" onClick={() => void mark("set_aside")}>
              Set aside
            </button>
          </div>
          {error ? <p className="muted small">That did not save just now.</p> : null}
        </>
      )}
    </section>
  );
}
