"use client";

import { useId, useState, useTransition } from "react";
import { PACES, PACE_HINTS, PACE_LABELS, type Pace } from "@/lib/pace";
import { setPace } from "@/lib/pace-actions";

/**
 * The pace choice for one workbook (0069). On the start screen it asks one
 * question with the default already picked; on the reading screen it is a
 * small select. Either way nothing locks: the reader can always open the
 * next part early.
 */
export function PaceChoice({ enrolmentId, pace, variant, readOnly = false }: { enrolmentId: string; pace: Pace; variant: "question" | "compact"; readOnly?: boolean }) {
  const [value, setValue] = useState<Pace>(pace);
  const [state, setState] = useState<"idle" | "saved" | "failed">("idle");
  const [pending, start] = useTransition();
  const id = useId();

  const choose = (next: Pace) => {
    setValue(next);
    if (readOnly) return;
    start(async () => setState((await setPace(enrolmentId, next)) ? "saved" : "failed"));
  };
  const status = pending ? null : state === "saved" ? "Saved." : state === "failed" ? "That did not save. Your pace stays as it was." : null;

  if (variant === "compact") {
    return (
      <p className="small pace-choice">
        <label htmlFor={`${id}-pace`}>Your pace </label>
        <select id={`${id}-pace`} value={value} disabled={readOnly || pending} onChange={(e) => choose(e.target.value as Pace)}>
          {PACES.map((p) => (
            <option key={p} value={p}>
              {PACE_LABELS[p]}
            </option>
          ))}
        </select>
        {status ? (
          <span className="muted" role="status">
            {" "}
            {status}
          </span>
        ) : null}
      </p>
    );
  }

  return (
    <fieldset className="pace-choice">
      <legend className="ak-q">How often would you like to do a part?</legend>
      {PACES.map((p) => (
        <div className="check" key={p}>
          <input type="radio" id={`${id}-${p}`} name={`${id}-pace`} value={p} checked={value === p} disabled={readOnly || pending} onChange={() => choose(p)} />
          <label htmlFor={`${id}-${p}`}>{PACE_LABELS[p]}</label>
        </div>
      ))}
      <p className="ak-muted ak-small">{PACE_HINTS[value]} You can open the next part early at any time, and change this later.</p>
      {status ? (
        <p className="ak-small" role="status">
          {status}
        </p>
      ) : null}
    </fieldset>
  );
}
