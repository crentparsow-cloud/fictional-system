"use client";

import type { WorkbookV3 } from "@akana/schema";
import { useState } from "react";
import { FieldRenderer } from "../FieldRenderer";
import { isAnswered, resolveField, type AnswerStore } from "../types";
import { Card, Eyebrow, FigurePlaceholder, Steps, minutesWord } from "./parts";

export type Exercise = WorkbookV3["exercises"][number];
export type ExerciseMode = "full" | "short";

export interface ExerciseScreenProps {
  exercise: Exercise;
  /** Scope the answers are stored under. Defaults to the exercise id. A repeat uses "<id>~r". */
  answerScope?: string;
  store: AnswerStore;
  /** Toolkit titles, used when a checklist points at the Toolkit. */
  toolkitTitles?: readonly string[];
  /** Controlled mode. Leave undefined to let the screen hold it. */
  mode?: ExerciseMode;
  defaultMode?: ExerciseMode;
  onModeChange?: (mode: ExerciseMode) => void;
  /** Shown above the title, for example "Week 3, about 10 minutes". */
  eyebrow?: string;
  readOnly?: boolean;
  /** Called when the reader presses Done. Enabled only when every required field has an answer. */
  onDone?: () => void;
  /** Marks this as a repeat of an earlier unit's exercise. */
  isRepeat?: boolean;
}

/**
 * One exercise on one page: purpose, why, steps, example, fields, reflect,
 * done_when. The legacy app paged through these; here they sit on one screen
 * so the app can decide how to page them. A short version toggle appears when
 * the exercise has one.
 */
export function ExerciseScreen({
  exercise: e,
  answerScope,
  store,
  toolkitTitles = [],
  mode: modeProp,
  defaultMode = "full",
  onModeChange,
  eyebrow,
  readOnly,
  onDone,
  isRepeat,
}: ExerciseScreenProps) {
  const [modeState, setModeState] = useState<ExerciseMode>(defaultMode);
  const sv = e.short_version;
  const mode: ExerciseMode = sv ? (modeProp ?? modeState) : "full";
  const setMode = (m: ExerciseMode) => {
    setModeState(m);
    onModeChange?.(m);
  };
  const scope = answerScope ?? e.id;
  const fields = mode === "short" && sv ? e.fields.filter((f) => sv.field_ids.includes(f.id)) : e.fields;
  const steps = mode === "short" && sv ? sv.steps : e.steps;
  const minutes = mode === "short" && sv ? sv.minutes : e.minutes;
  const resolved = fields.map((f) => resolveField(f, toolkitTitles));
  const ready = resolved.every((f) => isAnswered(f, store.get(scope, f.id)));
  const reflectValue = store.get(scope, "reflect");
  const firstFigure = e.steps[0]?.figure;

  return (
    <article className="ak-screen ak-exercise" data-exercise={e.id} data-mode={mode}>
      <header className="ak-ex-head">
        {firstFigure ? <FigurePlaceholder figure={firstFigure} /> : null}
        <div>
          <Eyebrow>
            {eyebrow ? `${eyebrow}, ` : ""}
            {isRepeat ? "comes back, " : ""}
            {mode === "short" ? "short version, " : ""}about {minutesWord(minutes)}
          </Eyebrow>
          <h2 className="ak-h2">{e.title}</h2>
        </div>
      </header>

      {sv ? (
        <div className="ak-seg" role="group" aria-label="Version">
          <button type="button" aria-pressed={mode === "full"} onClick={() => setMode("full")}>
            Full version
            <span>About {minutesWord(e.minutes)}</span>
          </button>
          <button type="button" aria-pressed={mode === "short"} onClick={() => setMode("short")}>
            Short version
            <span>About {minutesWord(sv.minutes)}</span>
          </button>
        </div>
      ) : null}

      {mode === "full" ? (
        <>
          <p className="ak-purpose">
            <b>You will have:</b> {e.purpose}
          </p>
          <details className="ak-card ak-card-flat ak-details">
            <summary>Why this step</summary>
            <p className="ak-muted">{e.why}</p>
          </details>
        </>
      ) : null}

      <Steps steps={steps} heading={mode === "short" ? "The short version" : "The steps"} />

      {mode === "full" && e.example ? (
        <details className="ak-card ak-card-flat ak-details">
          <summary>How {e.example.character} did it</summary>
          <p className="ak-muted">{e.example.text}</p>
        </details>
      ) : null}

      <section className="ak-answers" aria-label="Your turn">
        <h3 className="ak-h3">Your turn</h3>
        {resolved.map((f) => (
          <FieldRenderer
            key={f.id}
            field={f}
            idPrefix={scope.replace(/[^a-z0-9_-]/gi, "_")}
            value={store.get(scope, f.id)}
            readOnly={readOnly}
            onChange={(v) => store.set(scope, f.id, v)}
          />
        ))}
        {mode === "full" && e.reflect ? (
          <div className="ak-field ak-field-long_text">
            <label className="ak-q" htmlFor={`${scope}-reflect`}>
              {e.reflect} <span className="ak-muted ak-small">(optional)</span>
            </label>
            <textarea
              className="ak-textarea"
              id={`${scope}-reflect`}
              rows={3}
              readOnly={readOnly}
              value={typeof reflectValue === "string" ? reflectValue : ""}
              onChange={(ev) => store.set(scope, "reflect", ev.target.value)}
            />
          </div>
        ) : null}
        <span className="ak-saved ak-small ak-muted" aria-live="polite">
          {readOnly ? "Read only" : "Saved as you type"}
        </span>
      </section>

      <Card flat>
        <Eyebrow>Done when</Eyebrow>
        <p className="ak-done-when">{e.done_when}</p>
        {onDone && !readOnly ? (
          <button type="button" className="ak-btn" disabled={!ready} onClick={onDone}>
            Done
          </button>
        ) : null}
      </Card>
    </article>
  );
}
