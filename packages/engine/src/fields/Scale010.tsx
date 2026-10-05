"use client";

import type { FieldProps } from "../types";
import { Chip, FieldHead, FieldShell } from "./common";

/** Eleven chips, 0 to 10. One can be pressed at a time. */
export function Scale010({ field, value, onChange, readOnly, controlId }: FieldProps<"scale_0_10">) {
  const id = controlId ?? field.id;
  return (
    <FieldShell type="scale_0_10">
      <FieldHead field={field} id={`${id}-label`} />
      <div className="ak-chips ak-chips-scale" role="group" aria-labelledby={`${id}-label`}>
        {Array.from({ length: 11 }, (_, n) => (
          <Chip
            key={n}
            pressed={value === n}
            disabled={readOnly}
            label={`${n} out of 10`}
            onPress={() => onChange(value === n ? null : n)}
          >
            {n}
          </Chip>
        ))}
      </div>
    </FieldShell>
  );
}
