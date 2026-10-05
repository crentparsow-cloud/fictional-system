"use client";

import type { FieldProps } from "../types";
import { FieldHead, FieldShell } from "./common";

export function LongText({ field, value, onChange, readOnly, controlId }: FieldProps<"long_text">) {
  const id = controlId ?? field.id;
  return (
    <FieldShell type="long_text">
      <FieldHead field={field} htmlFor={id} />
      <textarea
        className="ak-textarea"
        id={id}
        value={value}
        readOnly={readOnly}
        rows={4}
        aria-describedby={field.help ? `${id}-help` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </FieldShell>
  );
}
