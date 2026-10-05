"use client";

import type { FieldProps } from "../types";
import { FieldHead, FieldShell } from "./common";

export function ShortText({ field, value, onChange, readOnly, controlId }: FieldProps<"short_text">) {
  const id = controlId ?? field.id;
  return (
    <FieldShell type="short_text">
      <FieldHead field={field} htmlFor={id} />
      <input
        className="ak-input"
        type="text"
        id={id}
        value={value}
        readOnly={readOnly}
        aria-describedby={field.help ? `${id}-help` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </FieldShell>
  );
}
