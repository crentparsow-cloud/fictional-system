"use client";

import type { FieldProps } from "../types";
import { Chip, FieldHead, FieldShell } from "./common";

/** One row per item, five chips each. 1 is often hard, 5 is usually fine. */
export function RatingGrid({ field, value, onChange, readOnly, controlId }: FieldProps<"rating_grid">) {
  const id = controlId ?? field.id;
  const rows = field.rows ?? [];
  const set = (ri: number, n: number) => {
    const next = rows.map((_, i) => value[i] ?? null);
    next[ri] = value[ri] === n ? null : n;
    onChange(next);
  };
  return (
    <FieldShell type="rating_grid">
      <FieldHead field={field} id={`${id}-label`} />
      {!field.help ? <p className="ak-muted ak-small">1 is often hard. 5 is usually fine.</p> : null}
      <div className="ak-grid-rate" role="group" aria-labelledby={`${id}-label`}>
        {rows.map((r, ri) => (
          <div className="ak-grid-row" key={ri}>
            <span className="ak-grid-rowlabel" id={`${id}-row-${ri}`}>
              {r}
            </span>
            <div className="ak-chips ak-chips-5" role="group" aria-labelledby={`${id}-row-${ri}`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Chip
                  key={n}
                  pressed={value[ri] === n}
                  disabled={readOnly}
                  label={`${r}: ${n} out of 5`}
                  onPress={() => set(ri, n)}
                >
                  {n}
                </Chip>
              ))}
            </div>
          </div>
        ))}
      </div>
    </FieldShell>
  );
}
