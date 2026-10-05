"use client";

import type { WorkbookV3 } from "@akana/schema";
import { KEEP_GOING_SCOPE } from "../store";
import type { AnswerStore } from "../types";
import { Card, Eyebrow } from "./parts";

export interface KeepGoingScreenProps {
  workbook: WorkbookV3;
  store: AnswerStore;
  onOpenExercise?: (exerciseId: string) => void;
  readOnly?: boolean;
}

/**
 * After the programme: a few monthly questions and the exercises worth
 * returning to. Nothing here counts months or days.
 */
export function KeepGoingScreen({ workbook: doc, store, onOpenExercise, readOnly }: KeepGoingScreenProps) {
  const kg = doc.keep_going;
  if (!kg) {
    return (
      <section className="ak-screen ak-keep">
        <h2 className="ak-h2">Keep going</h2>
        <p className="ak-muted">This workbook has no Keep going section.</p>
      </section>
    );
  }
  const byId = new Map(doc.exercises.map((e) => [e.id, e]));
  return (
    <section className="ak-screen ak-keep">
      <header>
        <h2 className="ak-h2">Keep going</h2>
        <p className="ak-muted">A few questions to come back to whenever you like, and the exercises worth a second run.</p>
      </header>
      {kg.monthly_questions.map((q, i) => {
        const id = `mq_${i + 1}`;
        const v = store.get(KEEP_GOING_SCOPE, id);
        return (
          <div className="ak-field ak-field-long_text" key={id}>
            <label className="ak-q" htmlFor={`ak-keep-${id}`}>
              {q}
            </label>
            <textarea
              className="ak-textarea"
              id={`ak-keep-${id}`}
              rows={3}
              readOnly={readOnly}
              value={typeof v === "string" ? v : ""}
              onChange={(e) => store.set(KEEP_GOING_SCOPE, id, e.target.value)}
            />
          </div>
        );
      })}
      {kg.refresher_ids.length ? (
        <Card flat>
          <Eyebrow>Worth another run</Eyebrow>
          <ul className="ak-plain-list">
            {kg.refresher_ids.map((id) => {
              const e = byId.get(id);
              if (!e) return null;
              return (
                <li key={id}>
                  {onOpenExercise ? (
                    <button type="button" className="ak-link" onClick={() => onOpenExercise(id)}>
                      {e.title}
                    </button>
                  ) : (
                    e.title
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
    </section>
  );
}
