"use client";

import { useState } from "react";
import { DAYS_LONG, DAYS_SHORT, DAY_NAMES, type FieldProps } from "../types";
import { Chip, FieldHead, FieldShell } from "./common";

/**
 * Without rows: seven toggles, one per day, Monday first.
 * With rows: pick a day, then rate each row 1 to 5 for that day.
 */
export function WeeklyGrid({ field, value, onChange, readOnly, controlId }: FieldProps<"weekly_grid">) {
  const id = controlId ?? field.id;
  const [day, setDay] = useState(0);

  if (field.rows) {
    const rows = field.rows;
    const days = value as (number | null)[][];
    const current = days[day] ?? rows.map(() => null);
    const set = (ri: number, n: number) => {
      const next = Array.from({ length: 7 }, (_, d) => rows.map((_, r) => days[d]?.[r] ?? null));
      const target = next[day];
      if (target) target[ri] = current[ri] === n ? null : n;
      onChange(next);
    };
    return (
      <FieldShell type="weekly_grid">
        <FieldHead field={field} id={`${id}-label`} />
        <div className="ak-chips ak-chips-days" role="group" aria-label="Day">
          {DAYS_LONG.map((d, i) => (
            <Chip key={d} pressed={i === day} label={DAY_NAMES[i]} onPress={() => setDay(i)}>
              {d}
            </Chip>
          ))}
        </div>
        <div className="ak-grid-rate" role="group" aria-labelledby={`${id}-label`}>
          {rows.map((r, ri) => (
            <div className="ak-grid-row" key={ri}>
              <span className="ak-grid-rowlabel ak-small" id={`${id}-row-${ri}`}>
                {r}
              </span>
              <div className="ak-chips ak-chips-5" role="group" aria-labelledby={`${id}-row-${ri}`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Chip
                    key={n}
                    pressed={current[ri] === n}
                    disabled={readOnly}
                    label={`${DAY_NAMES[day]}, ${r}: ${n} out of 5`}
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

  const flags = value as boolean[];
  const toggle = (i: number) => {
    const next = Array.from({ length: 7 }, (_, d) => flags[d] ?? false);
    next[i] = !next[i];
    onChange(next);
  };
  return (
    <FieldShell type="weekly_grid">
      <FieldHead field={field} id={`${id}-label`} />
      <div className="ak-chips ak-chips-7" role="group" aria-labelledby={`${id}-label`}>
        {DAYS_SHORT.map((d, i) => (
          <Chip key={i} pressed={flags[i] ?? false} disabled={readOnly} label={DAY_NAMES[i]} onPress={() => toggle(i)}>
            {d}
          </Chip>
        ))}
      </div>
    </FieldShell>
  );
}
