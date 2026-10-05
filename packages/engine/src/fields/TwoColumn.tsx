"use client";

import type { FieldProps } from "../types";
import { FieldHead, FieldShell } from "./common";

/**
 * Two headed columns of text inputs. Two rows to begin with. A row is added
 * when the last one has something in it, up to max_items (eight when unset).
 */
export function TwoColumn({ field, value, onChange, readOnly, controlId }: FieldProps<"two_column">) {
  const id = controlId ?? field.id;
  const [colA, colB] = [field.columns?.[0] ?? "Left", field.columns?.[1] ?? "Right"];
  const max = field.max_items ?? 8;
  const rows = value.length ? value : [["", ""], ["", ""]];
  const set = (i: number, j: number, text: string) => {
    const next = rows.map((r) => [r[0] ?? "", r[1] ?? ""]);
    const row = next[i];
    if (row) row[j] = text;
    onChange(next);
  };
  const canAdd = !readOnly && rows.length < max && rows[rows.length - 1]?.some((x) => x.trim());
  const add = () => onChange([...rows.map((r) => [r[0] ?? "", r[1] ?? ""]), ["", ""]]);
  return (
    <FieldShell type="two_column">
      <FieldHead field={field} id={`${id}-label`} />
      <div className="ak-two ak-two-head ak-small ak-muted" aria-hidden="true">
        <span>{colA}</span>
        <span>{colB}</span>
      </div>
      <div className="ak-stack" role="group" aria-labelledby={`${id}-label`}>
        {rows.map((r, i) => (
          <div className="ak-two" key={i}>
            <input
              className="ak-input"
              type="text"
              id={`${id}-${i}-0`}
              aria-label={`${colA} ${i + 1}`}
              value={r[0] ?? ""}
              readOnly={readOnly}
              onChange={(e) => set(i, 0, e.target.value)}
            />
            <input
              className="ak-input"
              type="text"
              id={`${id}-${i}-1`}
              aria-label={`${colB} ${i + 1}`}
              value={r[1] ?? ""}
              readOnly={readOnly}
              onChange={(e) => set(i, 1, e.target.value)}
            />
          </div>
        ))}
      </div>
      {canAdd ? (
        <button type="button" className="ak-btn ak-btn-quiet" onClick={add}>
          Add another row
        </button>
      ) : null}
    </FieldShell>
  );
}
