"use client";

import type { FieldProps } from "../types";
import { Chip, FieldHead, FieldShell } from "./common";

const OPTIONS: ReadonlyArray<readonly ["yes" | "no", string]> = [
  ["yes", "Yes"],
  ["no", "Not yet"],
];

export function YesNo({ field, value, onChange, readOnly, controlId }: FieldProps<"yes_no">) {
  const id = controlId ?? field.id;
  return (
    <FieldShell type="yes_no">
      <FieldHead field={field} id={`${id}-label`} />
      <div className="ak-chips" role="group" aria-labelledby={`${id}-label`}>
        {OPTIONS.map(([val, label]) => (
          <Chip key={val} pressed={value === val} disabled={readOnly} onPress={() => onChange(value === val ? null : val)}>
            {label}
          </Chip>
        ))}
      </div>
    </FieldShell>
  );
}
