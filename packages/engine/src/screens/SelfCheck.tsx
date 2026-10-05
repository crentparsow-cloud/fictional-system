"use client";

import type { WorkbookV3 } from "@akana/schema";
import { Eyebrow } from "./parts";

export type SelfCheck = NonNullable<WorkbookV3["selfcheck"]>;
/** Item id to the index of the chosen scale label, or null. */
export type SelfCheckAnswers = Record<string, number | null>;

export interface SelfCheckScreenProps {
  selfcheck: SelfCheck;
  answers: SelfCheckAnswers;
  onChange: (answers: SelfCheckAnswers) => void;
  onFinish?: () => void;
  /** Shown above the heading, for example "Your starting self-check" or "Week 6 self-check". */
  eyebrow?: string;
  readOnly?: boolean;
}

/**
 * The unscored self-check. It shows the intro, every item grouped by area,
 * and the result note. It never shows a total, a score or a band. The
 * schema's `scored` flag is ignored here on purpose: wellbeing tiers must
 * stay unscored and the engine does not add up answers for anyone.
 */
export function SelfCheckScreen({ selfcheck: sc, answers, onChange, onFinish, eyebrow = "Your self-check", readOnly }: SelfCheckScreenProps) {
  const done = sc.items.every((i) => answers[i.id] !== undefined && answers[i.id] !== null);
  const set = (id: string, n: number) => onChange({ ...answers, [id]: answers[id] === n ? null : n });
  return (
    <section className="ak-screen ak-selfcheck">
      <header>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="ak-h2">How things are for you</h2>
        <p>{sc.intro}</p>
      </header>
      {sc.areas.map((a) => (
        <section className="ak-sc-area" key={a.id} aria-labelledby={`ak-sc-${a.id}`}>
          <h3 className="ak-h3" id={`ak-sc-${a.id}`}>
            {a.label}
          </h3>
          {sc.items
            .filter((i) => i.area === a.id)
            .map((i) => (
              <div className="ak-sc-item" key={i.id}>
                <p className="ak-q" id={`ak-sc-item-${i.id}`}>
                  {i.text}
                </p>
                <div className="ak-sc-options" role="group" aria-labelledby={`ak-sc-item-${i.id}`}>
                  {sc.scale_labels.map((l, n) => (
                    <button
                      type="button"
                      key={n}
                      className="ak-sc-option"
                      aria-pressed={answers[i.id] === n}
                      disabled={readOnly}
                      onClick={() => set(i.id, n)}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            ))}
        </section>
      ))}
      <p className="ak-note">{sc.result_note}</p>
      {onFinish ? (
        <button type="button" className="ak-btn" disabled={!done || readOnly} onClick={onFinish}>
          Finish
        </button>
      ) : null}
    </section>
  );
}
