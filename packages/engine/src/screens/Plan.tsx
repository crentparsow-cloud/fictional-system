"use client";

import type { WorkbookV3 } from "@akana/schema";
import { useState } from "react";
import { PLAN_SCOPE, planEditField, planLines, type PlanLine } from "../progress";
import type { AnswerStore } from "../types";
import { Eyebrow, unitLabel } from "./parts";

export interface PlanScreenProps {
  workbook: WorkbookV3;
  store: AnswerStore;
  readOnly?: boolean;
}

/**
 * My plan (F-017): one page that builds itself from the reader's answers.
 * Each line says which unit it came from. Every line can be changed, taken
 * out or put back, because a reader may no longer agree with what they
 * wrote in week 2. Edits are the reader's own answers and are saved the
 * same way, sealed.
 */
export function PlanScreen({ workbook: doc, store, readOnly }: PlanScreenProps) {
  const sections = planLines(doc, store);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (!sections.length) {
    return (
      <section className="ak-screen ak-plan">
        <h2 className="ak-h2">My plan</h2>
        <p className="ak-muted">This workbook has no plan page.</p>
      </section>
    );
  }

  const tag = (l: PlanLine) => ("why" in l.source ? "From your start" : l.unit ? unitLabel(doc, l.unit) : "Your answer");
  const save = (key: string, value: string | null) => store.set(PLAN_SCOPE, planEditField(key), value);

  return (
    <section className="ak-screen ak-plan">
      <header>
        <h2 className="ak-h2">My plan</h2>
        <p className="ak-muted">One page that builds itself from your answers. Change any line so it still sounds like you.</p>
      </header>
      {sections.map((s) => {
        const shown = s.lines.filter((l) => !l.hidden);
        const hidden = s.lines.filter((l) => l.hidden);
        return (
          <section key={s.id} className="ak-card ak-plan-section" aria-labelledby={`ak-plan-${s.id}`}>
            <h3 className="ak-h3" id={`ak-plan-${s.id}`}>
              {s.title}
            </h3>
            {shown.length === 0 ? <p className="ak-muted ak-small">Fills in as you work through the {unitWordPlural(doc)}.</p> : null}
            <ul className="ak-plain-list ak-plan-lines">
              {shown.map((l) => (
                <li key={l.key} className="ak-plan-line" data-line={l.key}>
                  <Eyebrow>
                    {tag(l)}
                    {l.edited ? ", changed by you" : ""}
                  </Eyebrow>
                  {editing === l.key ? (
                    <div className="ak-field">
                      <label className="ak-q ak-small" htmlFor={`ak-plan-edit-${l.key}`}>
                        Change this line
                      </label>
                      <textarea
                        id={`ak-plan-edit-${l.key}`}
                        className="ak-textarea"
                        rows={3}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                      />
                      <div className="ak-row">
                        <button
                          type="button"
                          className="ak-btn"
                          onClick={() => {
                            save(l.key, draft.trim() === l.original.trim() ? null : draft);
                            setEditing(null);
                          }}
                        >
                          Save line
                        </button>
                        <button type="button" className="ak-btn ak-btn-quiet" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="ak-plan-text">{l.text}</p>
                      {readOnly ? null : (
                        <div className="ak-row ak-no-print">
                          <button
                            type="button"
                            className="ak-link"
                            onClick={() => {
                              setDraft(l.text);
                              setEditing(l.key);
                            }}
                          >
                            Edit
                          </button>
                          <button type="button" className="ak-link" onClick={() => save(l.key, "")}>
                            Take out
                          </button>
                          {l.edited ? (
                            <button type="button" className="ak-link" onClick={() => save(l.key, null)}>
                              Use my original answer
                            </button>
                          ) : null}
                        </div>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
            {hidden.length && !readOnly ? (
              <details className="ak-details ak-no-print">
                <summary>Lines you took out</summary>
                <ul className="ak-plain-list">
                  {hidden.map((l) => (
                    <li key={l.key}>
                      <p className="ak-small ak-muted">{l.original}</p>
                      <button type="button" className="ak-link" onClick={() => save(l.key, null)}>
                        Put it back
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        );
      })}
      <p className="ak-small ak-muted">Your plan is saved as you go. You can print it or download it from You, Download my work.</p>
    </section>
  );
}

function unitWordPlural(doc: Pick<WorkbookV3, "structure">): string {
  return { week: "weeks", day: "days", module: "modules", chapter: "chapters" }[doc.structure.unit];
}
