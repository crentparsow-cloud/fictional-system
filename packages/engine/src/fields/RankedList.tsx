"use client";

import type { FieldProps } from "../types";
import { FieldHead, FieldShell } from "./common";

/** Numbered text inputs, max_items of them (three when unset). min_items is shown as a hint. */
export function RankedList({ field, value, onChange, readOnly, controlId }: FieldProps<"ranked_list">) {
  const id = controlId ?? field.id;
  const count = field.max_items ?? 3;
  const set = (i: number, text: string) => {
    const next = Array.from({ length: count }, (_, j) => value[j] ?? "");
    next[i] = text;
    onChange(next);
  };
  return (
    <FieldShell type="ranked_list">
      <FieldHead field={field} id={`${id}-label`} />
      {field.min_items ? (
        <p className="ak-muted ak-small">
          At least {field.min_items}, up to {count}.
        </p>
      ) : null}
      <div className="ak-stack" role="group" aria-labelledby={`${id}-label`}>
        {Array.from({ length: count }, (_, i) => (
          <input
            key={i}
            className="ak-input"
            type="text"
            id={`${id}-${i}`}
            aria-label={`${field.label} ${i + 1}`}
            placeholder={`${i + 1}.`}
            value={value[i] ?? ""}
            readOnly={readOnly}
            onChange={(e) => set(i, e.target.value)}
          />
        ))}
      </div>
    </FieldShell>
  );
}
