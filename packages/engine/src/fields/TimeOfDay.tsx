"use client";

import type { FieldProps } from "../types";
import { FieldHead, FieldShell } from "./common";

export function TimeOfDay({ field, value, onChange, readOnly, controlId }: FieldProps<"time_of_day">) {
  const id = controlId ?? field.id;
  return (
    <FieldShell type="time_of_day">
      <FieldHead field={field} htmlFor={id} />
      <input
        className="ak-input ak-input-time"
        type="time"
        id={id}
        value={value}
        readOnly={readOnly}
        aria-describedby={field.help ? `${id}-help` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </FieldShell>
  );
}
