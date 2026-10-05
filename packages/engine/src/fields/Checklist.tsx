"use client";

import type { FieldProps } from "../types";
import { FieldHead, FieldShell } from "./common";

/**
 * One checkbox per option. The options list is resolved before this renders:
 * the "From your Toolkit" marker is swapped for tool titles by resolveField.
 */
export function Checklist({ field, value, onChange, readOnly, controlId }: FieldProps<"checklist">) {
  const id = controlId ?? field.id;
  const options = field.options ?? [];
  const toggle = (i: number) => {
    const next = options.map((_, j) => value[j] ?? false);
    next[i] = !next[i];
    onChange(next);
  };
  return (
    <FieldShell type="checklist">
      <FieldHead field={field} id={`${id}-label`} />
      <div className="ak-stack" role="group" aria-labelledby={`${id}-label`}>
        {options.map((o, i) => (
          <label className="ak-check" key={`${i}-${o}`}>
            <input type="checkbox" checked={value[i] ?? false} disabled={readOnly} onChange={() => toggle(i)} />
            <span>{o}</span>
          </label>
        ))}
      </div>
    </FieldShell>
  );
}
