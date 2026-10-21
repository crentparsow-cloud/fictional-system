"use client";

import { useId, useState } from "react";
import {
  OUTLINE_LIMITS,
  OUTLINE_QUESTIONS,
  OUTLINE_STORAGE_KEY,
  PACES,
  PACE_LABELS,
  UNIT_KINDS,
  generateOutline,
  outlineToText,
  parseOutlineAnswers,
  type Outline,
  type OutlineField,
  type OutlineAnswers,
} from "@/lib/studio-outline";

/**
 * The five questions and the editable outline (build list 14.31). All in the
 * browser. The outline can be edited line by line, copied, downloaded as a text
 * file, or kept in this browser for the builder to pick up.
 */

function store(value: string): boolean {
  try {
    window.localStorage.setItem(OUTLINE_STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

export function OutlineGenerator() {
  const uid = useId();
  const [errors, setErrors] = useState<Partial<Record<OutlineField, string>>>({});
  const [answers, setAnswers] = useState<OutlineAnswers | null>(null);
  const [outline, setOutline] = useState<Outline | null>(null);
  const [note, setNote] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = parseOutlineAnswers({
      outcome: fd.get("outcome") ?? "",
      reader: fd.get("reader") ?? "",
      unitKind: fd.get("unitKind") ?? "",
      unitCount: fd.get("unitCount") ?? "",
      ideas: fd.get("ideas") ?? "",
      pace: fd.get("pace") ?? "",
    });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setAnswers(parsed.answers);
    setOutline(generateOutline(parsed.answers));
    setNote("");
  }

  function setFocus(i: number, value: string) {
    setOutline((o) => (o ? { ...o, units: o.units.map((u, k) => (k === i ? { ...u, focus: value } : u)) } : o));
  }
  function setExercises(i: number, value: number) {
    setOutline((o) => (o ? { ...o, units: o.units.map((u, k) => (k === i ? { ...u, exercises: value } : u)) } : o));
  }

  const word = outline?.unitKind ?? "week";

  return (
    <>
      <form onSubmit={onSubmit} className="admin-form studio-wide" noValidate>
        {OUTLINE_QUESTIONS.map((q, n) => {
          const id = `${uid}-${q.key}`;
          const err = errors[q.key as OutlineField];
          return (
            <div key={q.key} className="contact-field">
              <p>
                <strong>
                  {n + 1}. {q.label}
                </strong>
              </p>
              <p id={`${id}-hint`} className="muted small">
                {q.hint}
              </p>
              {q.key === "outcome" || q.key === "reader" ? (
                <textarea
                  id={id}
                  name={q.key}
                  rows={2}
                  maxLength={q.key === "outcome" ? OUTLINE_LIMITS.outcome : OUTLINE_LIMITS.reader}
                  aria-describedby={`${id}-hint${err ? ` ${id}-err` : ""}`}
                  aria-invalid={err ? true : undefined}
                  defaultValue={answers ? answers[q.key] : ""}
                />
              ) : q.key === "length" ? (
                <div className="builder-row">
                  <label htmlFor={`${id}-kind`}>Unit</label>
                  <select id={`${id}-kind`} name="unitKind" defaultValue={answers?.unitKind ?? "week"}>
                    {UNIT_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k.charAt(0).toUpperCase() + k.slice(1)}
                      </option>
                    ))}
                  </select>
                  <label htmlFor={`${id}-count`}>How many</label>
                  <input
                    id={`${id}-count`}
                    name="unitCount"
                    type="number"
                    min={OUTLINE_LIMITS.minUnits}
                    max={OUTLINE_LIMITS.maxUnits}
                    defaultValue={answers?.unitCount ?? 8}
                    aria-describedby={`${id}-hint${err ? ` ${id}-err` : ""}`}
                    aria-invalid={err ? true : undefined}
                  />
                </div>
              ) : q.key === "ideas" ? (
                <textarea
                  id={id}
                  name="ideas"
                  rows={8}
                  aria-describedby={`${id}-hint${err ? ` ${id}-err` : ""}`}
                  aria-invalid={err ? true : undefined}
                  defaultValue={answers ? answers.ideas.join("\n") : ""}
                />
              ) : (
                <fieldset className="studio-radios">
                  <legend className="admin-vh">{q.label}</legend>
                  {PACES.map((p) => (
                    <label key={p} className="check">
                      <input type="radio" name="pace" value={p} defaultChecked={(answers?.pace ?? "two") === p} /> {PACE_LABELS[p]}
                    </label>
                  ))}
                </fieldset>
              )}
              {err ? (
                <p id={`${id}-err`} className="form-error">
                  {err}
                </p>
              ) : null}
            </div>
          );
        })}
        <div className="admin-actions">
          <button type="submit" className="btn">
            Make the outline
          </button>
        </div>
      </form>

      {outline && answers ? (
        <section className="card" aria-labelledby={`${uid}-out`}>
          <h2 id={`${uid}-out`}>Your outline</h2>
          <p className="muted small">Change any line. The first and last units are fixed in shape: the first looks at where the reader is, the last plans what comes next.</p>
          <ol className="studio-plain">
            {outline.units.map((u, i) => (
              <li key={u.number} className="builder-row">
                <label htmlFor={`${uid}-f-${i}`}>
                  {word.charAt(0).toUpperCase() + word.slice(1)} {u.number}
                </label>
                <input id={`${uid}-f-${i}`} type="text" maxLength={300} value={u.focus} onChange={(e) => setFocus(i, e.target.value)} />
                {u.topics.length ? <p className="muted small">Covers: {u.topics.join("; ")}</p> : null}
                <label htmlFor={`${uid}-x-${i}`}>Exercises</label>
                <select id={`${uid}-x-${i}`} value={u.exercises} onChange={(e) => setExercises(i, Number(e.target.value))}>
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ol>
          <div className="admin-actions">
            <button
              type="button"
              className="btn secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(outlineToText(outline, answers));
                  setNote("Copied.");
                } catch {
                  setNote("Your browser would not copy. Use Download instead.");
                }
              }}
            >
              Copy as text
            </button>{" "}
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                const blob = new Blob([outlineToText(outline, answers)], { type: "text/plain;charset=utf-8" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = "akana-outline.txt";
                a.click();
                URL.revokeObjectURL(a.href);
                setNote("Downloaded.");
              }}
            >
              Download
            </button>{" "}
            <button
              type="button"
              className="btn"
              onClick={() => setNote(store(JSON.stringify(outline)) ? "Kept in this browser. Open a workbook in the builder and choose to add it." : "This browser would not keep it. Copy or download instead.")}
            >
              Keep for the builder
            </button>
          </div>
          <p role="status" className="muted small">
            {note}
          </p>
        </section>
      ) : null}
    </>
  );
}
