"use client";

import type { WorkbookV3 } from "@akana/schema";
import { useEffect, useRef, useState } from "react";
import { FieldRenderer } from "../FieldRenderer";
import { answerText } from "../progress";
import { isAnswered, resolveField, type AnswerStore, type FieldValue } from "../types";
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
  /**
   * Starting values for fields that carry prefill_from (F-017). Called for
   * each such field the reader has not answered; a returned value is written
   * to the store once, and is then the reader's to change.
   */
  prefill?: (field: Exercise["fields"][number]) => FieldValue | undefined;
  /** Already marked done, so the screen can say so. */
  done?: boolean;
  /** For a repeat: where the first answers sit, shown side by side as "Then and now". */
  earlier?: { label: string; scope: string };
  /** The exercise's toolkit_link, when that tool is in the Toolkit. */
  relatedTool?: { id: string; title: string };
  onOpenTool?: (toolId: string) => void;
  /**
   * Page through the exercise one part per screen, as the legacy app did:
   * purpose, steps, example, your turn, done (the short version pages
   * steps, your turn, done). Off by default so the harness and previews
   * render every part at once.
   */
  paged?: boolean;
  /** Paged only: leaves the exercise, from the first page and from Done. */
  onClose?: () => void;
  /** Paged only: the words on that button, for example "Back to Week 2". */
  closeLabel?: string;
  /** Paged only: open on this part (pause and save, 14.5). Falls back to the first part if the exercise has no such part. */
  initialPage?: ExercisePage;
  /** Paged only: put the cursor in this field on open, when the part is Your turn. */
  initialFieldId?: string;
  /**
   * Paged only: tells the app where the reader is. Called when the part
   * changes and when a field takes focus. Ids only, never a value.
   */
  onPlace?: (place: { page: ExercisePage; fieldId: string | null }) => void;
}

export type ExercisePage = "purpose" | "steps" | "example" | "yours" | "done";

/** The pages an exercise shows, in order. An exercise with no example skips that page. */
export function exercisePages(e: Pick<Exercise, "example">, mode: ExerciseMode): ExercisePage[] {
  if (mode === "short") return ["steps", "yours", "done"];
  return e.example ? ["purpose", "steps", "example", "yours", "done"] : ["purpose", "steps", "yours", "done"];
}

const PAGE_NAMES: Record<ExercisePage, string> = {
  purpose: "What you will have",
  steps: "The steps",
  example: "An example",
  yours: "Your turn",
  done: "Done",
};

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
  prefill,
  done,
  earlier,
  relatedTool,
  onOpenTool,
  paged,
  onClose,
  closeLabel = "Back",
  initialPage,
  initialFieldId,
  onPlace,
}: ExerciseScreenProps) {
  const [modeState, setModeState] = useState<ExerciseMode>(defaultMode);
  const [pageIndex, setPageIndex] = useState(() => {
    if (!initialPage) return 0;
    const at = exercisePages(e, e.short_version ? defaultMode : "full").indexOf(initialPage);
    return at < 0 ? 0 : at;
  });
  const lastField = useRef<string | null>(initialFieldId ?? null);
  const answersRef = useRef<HTMLDivElement>(null);
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const turned = useRef(false);
  const sv = e.short_version;
  const mode: ExerciseMode = sv ? (modeProp ?? modeState) : "full";
  const setMode = (m: ExerciseMode) => {
    setModeState(m);
    onModeChange?.(m);
    setPageIndex(0);
  };
  const scope = answerScope ?? e.id;
  const fields = mode === "short" && sv ? e.fields.filter((f) => sv.field_ids.includes(f.id)) : e.fields;
  const steps = mode === "short" && sv ? sv.steps : e.steps;
  const minutes = mode === "short" && sv ? sv.minutes : e.minutes;
  const resolved = fields.map((f) => resolveField(f, toolkitTitles));
  const ready = resolved.every((f) => isAnswered(f, store.get(scope, f.id)));
  const reflectValue = store.get(scope, "reflect");
  const firstFigure = e.steps[0]?.figure;

  // prefill_from: carry an earlier answer in as a starting value, once.
  useEffect(() => {
    if (!prefill || readOnly) return;
    for (const f of e.fields) {
      if (!f.prefill_from || store.get(scope, f.id) !== undefined) continue;
      const v = prefill(f);
      if (v !== undefined && v !== null && v !== "") store.set(scope, f.id, v);
    }
    // Runs when the exercise or its scope changes, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e.id, scope]);

  const thenAndNow =
    isRepeat && earlier && sv
      ? e.fields
          .filter((f) => sv.field_ids.includes(f.id))
          .map((f) => {
            const rf = resolveField(f, toolkitTitles);
            return { id: f.id, label: f.label, then: answerText(rf, store.get(earlier.scope, f.id), toolkitTitles), now: answerText(rf, store.get(scope, f.id), toolkitTitles) };
          })
      : [];

  // Paged: one part per screen. Focus moves to the new page's heading so a
  // screen reader hears where it is, and keyboard users start at the top.
  const pages = exercisePages(e, mode);
  const index = Math.min(pageIndex, pages.length - 1);
  const page = pages[index] ?? "steps";
  useEffect(() => {
    if (!paged) return;
    if (!turned.current) return;
    pageHeading.current?.focus();
  }, [paged, index, mode]);
  const turn = (to: number) => {
    turned.current = true;
    setPageIndex(Math.max(0, Math.min(pages.length - 1, to)));
  };
  // Pause and save (14.5): report the part the reader is on, and put the
  // cursor back in the field they left when they come back to Your turn.
  const fieldPrefix = scope.replace(/[^a-z0-9_-]/gi, "_") + "-";
  useEffect(() => {
    if (!paged) return;
    onPlace?.({ page, fieldId: page === "yours" ? lastField.current : null });
    // Reported when the part changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paged, page]);
  useEffect(() => {
    if (!paged || page !== "yours" || !initialFieldId || turned.current) return;
    const el = answersRef.current?.querySelector<HTMLElement>(`[id="${fieldPrefix}${initialFieldId}"]`);
    el?.focus({ preventScroll: false });
    // Once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fieldsBlock = (
    <>
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
    </>
  );

  const thenAndNowCard = thenAndNow.length ? (
    <Card>
      <h3 className="ak-h3">Then and now</h3>
      {thenAndNow.map((r) => (
        <div key={r.id} className="ak-then-now">
          <p className="ak-small">
            <b>{r.label}</b>
          </p>
          <div className="ak-two-up">
            <div>
              <Eyebrow>{earlier?.label}</Eyebrow>
              <p className="ak-small">{r.then || "Not filled in"}</p>
            </div>
            <div>
              <Eyebrow>Now</Eyebrow>
              <p className="ak-small">{r.now || "Not filled in"}</p>
            </div>
          </div>
        </div>
      ))}
    </Card>
  ) : null;

  const versionToggle = sv ? (
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
  ) : null;

  if (paged) {
    const canFinish = !!onDone && !readOnly && !done;
    const forward = (() => {
      if (page === "done") return null;
      if (page === "yours" && canFinish) {
        return (
          <button
            type="button"
            className="ak-btn"
            disabled={!ready}
            onClick={() => {
              onDone?.();
              turn(index + 1);
            }}
          >
            Done
          </button>
        );
      }
      // Read only and not yet done: nothing lies beyond Your turn.
      if (page === "yours" && !done) return null;
      const next = pages[index + 1];
      const label = next === "example" ? "See an example" : next === "yours" ? "Your turn" : next === "steps" ? "See the steps" : "Next";
      return (
        <button type="button" className="ak-btn" onClick={() => turn(index + 1)}>
          {label}
        </button>
      );
    })();

    return (
      <article className="ak-screen ak-exercise ak-exercise-paged" data-exercise={e.id} data-mode={mode} data-page={page}>
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

        {/* Progress dots, no numbers on screen. Screen readers hear the part instead. */}
        <ol className="ak-dots" aria-hidden="true">
          {pages.map((p, i) => (
            <li key={p} className="ak-dot" data-state={i < index ? "done" : i === index ? "current" : "todo"} />
          ))}
        </ol>

        <section className="ak-page" aria-labelledby={`${scope}-page-h`}>
          <h3 className="ak-h3 ak-page-h" id={`${scope}-page-h`} ref={pageHeading} tabIndex={-1}>
            <span className="ak-visually-hidden">
              Part {index + 1} of {pages.length}:{" "}
            </span>
            {page === "example" && e.example ? `How ${e.example.character} did it` : page === "steps" && mode === "short" ? "The short version" : PAGE_NAMES[page]}
          </h3>

          {page === "purpose" ? (
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

          {page === "steps" ? <Steps steps={steps} /> : null}

          {page === "example" && e.example ? (
            <Card>
              <p>{e.example.text}</p>
            </Card>
          ) : null}

          {page === "yours" ? (
            <>
              <details className="ak-card ak-card-flat ak-details">
                <summary>{mode === "short" ? "The short version" : "The steps"}</summary>
                <Steps steps={steps} />
              </details>
              <div
                className="ak-answers"
                ref={answersRef}
                onFocusCapture={(ev) => {
                  const id = (ev.target as HTMLElement).id;
                  if (!id || !id.startsWith(fieldPrefix)) return;
                  const fieldId = id.slice(fieldPrefix.length);
                  if (!e.fields.some((f) => f.id === fieldId)) return;
                  lastField.current = fieldId;
                  onPlace?.({ page: "yours", fieldId });
                }}
              >
                {fieldsBlock}
              </div>
            </>
          ) : null}

          {page === "done" ? (
            <>
              <p className="ak-done-when">
                <b>{e.done_when}</b>
              </p>
              {done ? (
                <p className="ak-small ak-done-mark" role="status">
                  Marked done. You can still change your answers.
                </p>
              ) : null}
              {thenAndNowCard}
              {relatedTool && onOpenTool ? (
                <button type="button" className="ak-btn ak-btn-quiet" onClick={() => onOpenTool(relatedTool.id)}>
                  Related tool: {relatedTool.title}
                </button>
              ) : null}
            </>
          ) : null}
        </section>

        {index === 0 ? versionToggle : null}

        <nav className="ak-pager" aria-label="Exercise pages">
          {index > 0 && (page !== "done" || !onClose) ? (
            <button type="button" className="ak-btn ak-btn-secondary" onClick={() => turn(index - 1)}>
              Back
            </button>
          ) : null}
          {(index === 0 || page === "done") && onClose ? (
            <button type="button" className={page === "done" ? "ak-btn" : "ak-btn ak-btn-secondary"} onClick={onClose}>
              {closeLabel}
            </button>
          ) : null}
          {forward}
        </nav>
      </article>
    );
  }

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

      {thenAndNow.length ? (
        <Card>
          <h3 className="ak-h3">Then and now</h3>
          {thenAndNow.map((r) => (
            <div key={r.id} className="ak-then-now">
              <p className="ak-small">
                <b>{r.label}</b>
              </p>
              <div className="ak-two-up">
                <div>
                  <Eyebrow>{earlier?.label}</Eyebrow>
                  <p className="ak-small">{r.then || "Not filled in"}</p>
                </div>
                <div>
                  <Eyebrow>Now</Eyebrow>
                  <p className="ak-small">{r.now || "Not filled in"}</p>
                </div>
              </div>
            </div>
          ))}
        </Card>
      ) : null}

      <Card flat>
        <Eyebrow>Done when</Eyebrow>
        <p className="ak-done-when">{e.done_when}</p>
        {done ? (
          <p className="ak-small ak-done-mark" role="status">
            Marked done. You can still change your answers.
          </p>
        ) : null}
        {onDone && !readOnly && !done ? (
          <button type="button" className="ak-btn" disabled={!ready} onClick={onDone}>
            Done
          </button>
        ) : null}
        {relatedTool && onOpenTool ? (
          <button type="button" className="ak-btn ak-btn-quiet" onClick={() => onOpenTool(relatedTool.id)}>
            Related tool: {relatedTool.title}
          </button>
        ) : null}
      </Card>
    </article>
  );
}
