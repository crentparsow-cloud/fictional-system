"use client";

import type { Field } from "@akana/schema";
import { FieldHead, FieldShell } from "./common";

const NAMES: Record<string, string> = {
  number: "Number",
  currency: "Currency",
  table: "Table",
  decision_matrix: "Decision matrix",
};

/**
 * Stand-in for the four v3 field types whose renderers arrive in week 3.
 * Labelled so the harness and a reader can tell it from an unknown type.
 */
export function PendingField({ field }: { field: Field }) {
  return (
    <FieldShell type={field.type}>
      <FieldHead field={field} />
      <div className="ak-pending" role="note" data-pending-field={field.type}>
        {NAMES[field.type] ?? field.type} field. This renderer arrives in week 3.
      </div>
    </FieldShell>
  );
}
