"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { runBuilder } from "@/app/studio/workbooks/[id]/build/actions";
import { blankExercise, blankField, blankIdea, blankUnit, BUILDER_LIMITS, type BuilderExercise, type BuilderModel, type BuilderUnit } from "@/lib/studio-builder";
import { INITIAL_BUILDER_STATE, type BuilderFinding } from "@/lib/studio-builder-state";
import { outlineToBuilderUnits, OUTLINE_STORAGE_KEY, readStoredOutline } from "@/lib/studio-outline";

/**
 * The workbook builder form (build list 8.2). Edits units, key ideas and
 * exercises of the newest version and posts them as JSON to the runBuilder
 * action, which checks and saves a draft version. The form keeps a copy of
 * your work in this browser as you type, so a refused save or a closed tab does
 * not lose it. Existing units, exercises and answer fields cannot be removed
 * or reordered, because published ids must stay stable; ones added here can.
 */

const STORAGE_PREFIX = "akana.studio.builder.";

function must<T>(v: T | undefined): T {
  if (v === undefined) throw new Error("builder: missing row");
  return v;
}

function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStore(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked. The form still works.
  }
}

function Findings({ title, items, tone }: { title: string; items: BuilderFinding[]; tone: "error" | "warn" }) {
  if (!items.length) return null;
  return (
    <div className={`admin-notice admin-notice-${tone === "error" ? "error" : "ok"}`} role={tone === "error" ? "alert" : "status"}>
      <p>
        <strong>{title}</strong>
      </p>
      <ul className="studio-plain">
        {items.map((f, i) => (
          <li key={i}>
            <strong>{f.where}.</strong> {f.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WorkbookBuilder({
  workbookId,
  baseVersionId,
  orgId,
  unitKind,
  initial,
  published,
}: {
  workbookId: string;
  baseVersionId: string;
  orgId: string | null;
  unitKind: string;
  initial: BuilderModel;
  published: boolean;
}) {
  const uid = useId();
  const storeKey = `${STORAGE_PREFIX}${workbookId}.${baseVersionId}`;
  const [model, setModel] = useState<BuilderModel>(initial);
  const [state, action, pending] = useActionState(runBuilder, INITIAL_BUILDER_STATE);
  const [stored, setStored] = useState<BuilderModel | null>(null);
  const [outline, setOutline] = useState<BuilderUnit[] | null>(null);
  const first = useRef(true);
  const word = unitKind === "day" || unitKind === "module" || unitKind === "chapter" ? unitKind : "week";
  const Word = word.charAt(0).toUpperCase() + word.slice(1);

  // Offer work saved in this browser, and an outline made on the outline page.
  useEffect(() => {
    const raw = readStore(storeKey);
    if (raw) {
      try {
        const m = JSON.parse(raw) as BuilderModel;
        // Reading browser storage on mount is the point of this effect.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (m && Array.isArray(m.units) && JSON.stringify(m) !== JSON.stringify(initial)) setStored(m);
      } catch {
        writeStore(storeKey, null);
      }
    }
    const o = readStoredOutline(readStore(OUTLINE_STORAGE_KEY));
    if (o) setOutline(outlineToBuilderUnits(o));
  }, [storeKey, initial]);

  // Keep a copy as the author types, after the first render.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => writeStore(storeKey, JSON.stringify(model)), 600);
    return () => clearTimeout(t);
  }, [model, storeKey]);

  const edit = (fn: (m: BuilderModel) => void) =>
    setModel((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  const editUnit = (i: number, fn: (u: BuilderUnit) => void) =>
    edit((m) => {
      const u = m.units[i];
      if (u) fn(u);
    });
  const editEx = (i: number, k: number, fn: (e: BuilderExercise) => void) =>
    edit((m) => {
      const e = m.units[i]?.exercises[k];
      if (e) fn(e);
    });

  return (
    <form action={action} className="admin-form studio-wide builder-form">
      <input type="hidden" name="workbook" value={workbookId} />
      <input type="hidden" name="base" value={baseVersionId} />
      {orgId ? <input type="hidden" name="org" value={orgId} /> : null}
      <input type="hidden" name="model" value={JSON.stringify(model)} />

      {published ? (
        <p className="muted small">
          This version is live. Saving makes a new draft. Readers who have started keep the version they began, and answer fields that exist cannot be removed.
        </p>
      ) : null}

      {stored ? (
        <div className="card" role="status">
          <p>You have edits saved in this browser that are not in the latest version.</p>
          <div className="admin-actions">
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setModel(stored);
                setStored(null);
              }}
            >
              Restore those edits
            </button>{" "}
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                writeStore(storeKey, null);
                setStored(null);
              }}
            >
              Discard them
            </button>
          </div>
        </div>
      ) : null}

      {state.status !== "idle" ? (
        <>
          <p className={`admin-notice admin-notice-${state.status === "error" ? "error" : "ok"}`} role={state.status === "error" ? "alert" : "status"}>
            {state.message}
          </p>
          <Findings title="Fix these in the form" items={state.issues} tone="error" />
          <Findings title="The checks found problems" items={state.errors} tone="error" />
          <Findings title="Worth a look (these do not stop a save)" items={state.warnings} tone="warn" />
        </>
      ) : null}

      {model.units.map((u, i) => {
        const n = i + 1;
        return (
          <details key={i} className="card builder-unit" open={i === 0 || u.ref === null}>
            <summary>
              <strong>
                {Word} {n}
              </strong>
              {u.focus ? `: ${u.focus}` : ""} {u.ref === null ? <span className="badge">New</span> : null}
            </summary>

            <label htmlFor={`${uid}-focus-${i}`}>Title, as one full sentence</label>
            <input id={`${uid}-focus-${i}`} type="text" maxLength={BUILDER_LIMITS.focus} value={u.focus} onChange={(e) => editUnit(i, (x) => (x.focus = e.target.value))} />

            <label htmlFor={`${uid}-intro-${i}`}>Introduction: why this matters (two to four sentences)</label>
            <textarea id={`${uid}-intro-${i}`} rows={3} maxLength={BUILDER_LIMITS.intro} value={u.intro} onChange={(e) => editUnit(i, (x) => (x.intro = e.target.value))} />

            <fieldset className="builder-ideas">
              <legend>Key ideas ({u.ideas.length} of up to {BUILDER_LIMITS.ideasPerUnit})</legend>
              {u.ideas.map((idea, k) => (
                <div key={k} className="builder-idea">
                  <label htmlFor={`${uid}-ih-${i}-${k}`}>Idea {k + 1}: heading, as a sentence that makes a claim</label>
                  <input id={`${uid}-ih-${i}-${k}`} type="text" maxLength={BUILDER_LIMITS.heading} value={idea.heading} onChange={(e) => editUnit(i, (x) => (must(x.ideas[k]).heading = e.target.value))} />
                  <label htmlFor={`${uid}-ib-${i}-${k}`}>Explanation</label>
                  <textarea id={`${uid}-ib-${i}-${k}`} rows={3} maxLength={BUILDER_LIMITS.body} value={idea.body} onChange={(e) => editUnit(i, (x) => (must(x.ideas[k]).body = e.target.value))} />
                  <label htmlFor={`${uid}-ie-${i}-${k}`}>Example</label>
                  <textarea id={`${uid}-ie-${i}-${k}`} rows={2} maxLength={BUILDER_LIMITS.example} value={idea.example} onChange={(e) => editUnit(i, (x) => (must(x.ideas[k]).example = e.target.value))} />
                  <button type="button" className="btn secondary" onClick={() => editUnit(i, (x) => x.ideas.splice(k, 1))}>
                    Remove idea {k + 1}
                  </button>
                </div>
              ))}
              {u.ideas.length < BUILDER_LIMITS.ideasPerUnit ? (
                <button type="button" className="btn secondary" onClick={() => editUnit(i, (x) => x.ideas.push(blankIdea()))}>
                  Add a key idea
                </button>
              ) : null}
            </fieldset>

            <label htmlFor={`${uid}-take-${i}`}>Closing takeaway (one or two sentences)</label>
            <textarea id={`${uid}-take-${i}`} rows={2} maxLength={BUILDER_LIMITS.takeaway} value={u.takeaway} onChange={(e) => editUnit(i, (x) => (x.takeaway = e.target.value))} />

            {u.exercises.map((ex, k) => (
              <fieldset key={k} className="builder-exercise">
                <legend>
                  Exercise {k + 1} {ex.ref === null ? <span className="badge">New</span> : null}
                </legend>
                <label htmlFor={`${uid}-et-${i}-${k}`}>Title</label>
                <input id={`${uid}-et-${i}-${k}`} type="text" maxLength={BUILDER_LIMITS.title} value={ex.title} onChange={(e) => editEx(i, k, (x) => (x.title = e.target.value))} />
                <label htmlFor={`${uid}-ep-${i}-${k}`}>What it is for</label>
                <input id={`${uid}-ep-${i}-${k}`} type="text" maxLength={BUILDER_LIMITS.purpose} value={ex.purpose} onChange={(e) => editEx(i, k, (x) => (x.purpose = e.target.value))} />
                <label htmlFor={`${uid}-ew-${i}-${k}`}>Why it helps (the set-up paragraph)</label>
                <textarea id={`${uid}-ew-${i}-${k}`} rows={3} maxLength={BUILDER_LIMITS.why} value={ex.why} onChange={(e) => editEx(i, k, (x) => (x.why = e.target.value))} />
                <label htmlFor={`${uid}-em-${i}-${k}`}>Minutes</label>
                <input
                  id={`${uid}-em-${i}-${k}`}
                  type="number"
                  min={BUILDER_LIMITS.minutes[0]}
                  max={BUILDER_LIMITS.minutes[1]}
                  value={ex.minutes}
                  onChange={(e) => editEx(i, k, (x) => (x.minutes = Math.round(Number(e.target.value)) || BUILDER_LIMITS.minutes[0]))}
                />
                <label htmlFor={`${uid}-ec-${i}-${k}`}>Chapter of the book it comes from</label>
                <input id={`${uid}-ec-${i}-${k}`} type="text" maxLength={BUILDER_LIMITS.chapter} value={ex.chapter} onChange={(e) => editEx(i, k, (x) => (x.chapter = e.target.value))} />

                <p className="small">
                  <strong>Steps</strong>
                </p>
                {ex.steps.map((s, j) => (
                  <div key={j} className="builder-row">
                    <label htmlFor={`${uid}-es-${i}-${k}-${j}`} className="admin-vh">
                      Step {j + 1}
                    </label>
                    <input id={`${uid}-es-${i}-${k}-${j}`} type="text" maxLength={BUILDER_LIMITS.step} value={s} onChange={(e) => editEx(i, k, (x) => (x.steps[j] = e.target.value))} />
                    {ex.steps.length > 1 ? (
                      <button type="button" className="btn secondary" onClick={() => editEx(i, k, (x) => x.steps.splice(j, 1))}>
                        Remove step {j + 1}
                      </button>
                    ) : null}
                  </div>
                ))}
                {ex.steps.length < BUILDER_LIMITS.stepsPerExercise ? (
                  <button type="button" className="btn secondary" onClick={() => editEx(i, k, (x) => x.steps.push(""))}>
                    Add a step
                  </button>
                ) : null}

                <p className="small">
                  <strong>The question the reader answers</strong>
                </p>
                {ex.fields.map((f, j) => (
                  <div key={j} className="builder-row">
                    <label htmlFor={`${uid}-ef-${i}-${k}-${j}`}>
                      Field {j + 1} label {f.isNew ? "" : `(${f.type.replace(/_/g, " ")}, cannot change)`}
                    </label>
                    <input id={`${uid}-ef-${i}-${k}-${j}`} type="text" maxLength={BUILDER_LIMITS.label} value={f.label} onChange={(e) => editEx(i, k, (x) => (must(x.fields[j]).label = e.target.value))} />
                    <label htmlFor={`${uid}-eh-${i}-${k}-${j}`}>Hint (optional)</label>
                    <input id={`${uid}-eh-${i}-${k}-${j}`} type="text" maxLength={BUILDER_LIMITS.help} value={f.help} onChange={(e) => editEx(i, k, (x) => (must(x.fields[j]).help = e.target.value))} />
                    {f.isNew ? (
                      <>
                        <label htmlFor={`${uid}-ey-${i}-${k}-${j}`}>Answer length</label>
                        <select id={`${uid}-ey-${i}-${k}-${j}`} value={f.type} onChange={(e) => editEx(i, k, (x) => (must(x.fields[j]).type = e.target.value))}>
                          <option value="short_text">One line</option>
                          <option value="long_text">Several lines</option>
                        </select>
                        {ex.fields.length > 1 ? (
                          <button type="button" className="btn secondary" onClick={() => editEx(i, k, (x) => x.fields.splice(j, 1))}>
                            Remove field {j + 1}
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ))}
                {ex.fields.length < BUILDER_LIMITS.fieldsPerExercise ? (
                  <button type="button" className="btn secondary" onClick={() => editEx(i, k, (x) => x.fields.push(blankField()))}>
                    Add an answer field
                  </button>
                ) : null}

                <label htmlFor={`${uid}-ed-${i}-${k}`}>Done when</label>
                <input id={`${uid}-ed-${i}-${k}`} type="text" maxLength={BUILDER_LIMITS.doneWhen} value={ex.doneWhen} onChange={(e) => editEx(i, k, (x) => (x.doneWhen = e.target.value))} />

                {ex.ref === null ? (
                  <button type="button" className="btn secondary" onClick={() => editUnit(i, (x) => x.exercises.splice(k, 1))}>
                    Remove this exercise
                  </button>
                ) : null}
              </fieldset>
            ))}
            {u.exercises.length < BUILDER_LIMITS.exercisesPerUnit ? (
              <button type="button" className="btn secondary" onClick={() => editUnit(i, (x) => x.exercises.push(blankExercise()))}>
                Add an exercise
              </button>
            ) : null}

            {u.ref === null ? (
              <p>
                <button type="button" className="btn secondary" onClick={() => edit((m) => m.units.splice(i, 1))}>
                  Remove {word} {n}
                </button>
              </p>
            ) : null}
          </details>
        );
      })}

      <div className="admin-actions">
        {model.units.length < BUILDER_LIMITS.units ? (
          <button type="button" className="btn secondary" onClick={() => edit((m) => m.units.push(blankUnit()))}>
            Add a {word}
          </button>
        ) : null}
        {outline ? (
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              edit((m) => {
                const room = BUILDER_LIMITS.units - m.units.length;
                m.units.push(...outline.slice(0, room));
              });
              setOutline(null);
            }}
          >
            Add {outline.length} {outline.length === 1 ? word : `${word}s`} from your outline
          </button>
        ) : null}
      </div>

      <div className="admin-actions">
        <button type="submit" name="intent" value="check" className="btn secondary" disabled={pending}>
          {pending ? "Working" : "Check"}
        </button>{" "}
        <button type="submit" name="intent" value="save" className="btn" disabled={pending}>
          {pending ? "Working" : "Save as a draft version"}
        </button>
      </div>
      <p className="muted small">
        Check runs the same tests as Save and keeps nothing. A draft can only be saved when every check passes, so a half-written {word} stays in this browser until
        it is ready.
      </p>
    </form>
  );
}
