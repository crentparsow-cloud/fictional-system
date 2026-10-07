"use client";

import { useRef } from "react";
import type { FieldProps } from "../types";
import { emptyRow, formatCell, TABLE_CELL_MAX_CHARS, tableShape, tableTotals, totalLabel, type FieldDef, type TableCell, type TableValue } from "../values";
import { FieldHead, FieldShell } from "./common";
import { NumberBox } from "./NumberField";

/**
 * A table the reader fills in. Columns come from the field. Rows are either
 * fixed by the author (field.rows, shown as the first column) or added by the
 * reader with "Add a row", between min_items and max_items.
 *
 * When the field computes (sum or mean), every column after the first takes
 * numbers and a total row sits at the foot. A currency code in field.unit
 * makes those columns money.
 *
 * Keyboard: Tab moves cell to cell along each row. "Add a row" puts focus in
 * the new row's first cell. Removing a row puts focus on the row above, or on
 * "Add a row" when the first row goes. On a narrow screen each row stacks into
 * a card with the column name above each box; the controls do not change.
 */
export function Table({ field, value, onChange, readOnly, controlId }: FieldProps<"table">) {
  const id = controlId ?? field.id;
  const shape = tableShape(field);
  const rows = value;
  const wrap = useRef<HTMLDivElement>(null);
  const addBtn = useRef<HTMLButtonElement>(null);
  const totals = shape.computed ? tableTotals(field, rows) : null;
  const firstEditable = shape.fixedRows ? 1 : 0;
  const cellDef: FieldDef = {
    type: shape.currency ? "currency" : "number",
    label: field.label,
    unit: shape.currency ?? undefined,
    min: field.min,
    max: field.max,
    step: field.step,
  };

  const focusCell = (r: number) => {
    // After React commits, put focus in the row's first editable cell.
    requestAnimationFrame(() => {
      const el = wrap.current?.ownerDocument.getElementById(`${id}-r${r}-c${firstEditable}`);
      if (el) el.focus();
      else addBtn.current?.focus();
    });
  };

  const setCell = (r: number, c: number, cell: TableCell) => {
    const next = rows.map((row) => [...row]);
    const row = next[r];
    if (!row) return;
    row[c] = cell;
    onChange(next);
  };
  const canAdd = !readOnly && !shape.fixedRows && rows.length < shape.maxRows;
  const canRemove = !readOnly && !shape.fixedRows && rows.length > shape.minRows;
  const add = () => {
    onChange([...rows.map((row) => [...row]), emptyRow(shape)]);
    focusCell(rows.length);
  };
  const remove = (r: number) => {
    onChange(rows.filter((_, i) => i !== r).map((row) => [...row]));
    if (r > 0) focusCell(r - 1);
    else focusCell(0);
  };

  const rowName = (r: number) => (shape.fixedRows ? (shape.fixedRows[r] ?? `Row ${r + 1}`) : `Row ${r + 1}`);
  const describedBy = field.help ? `${id}-help` : undefined;

  return (
    <FieldShell type="table">
      <FieldHead field={field} id={`${id}-label`} />
      <div className="ak-table-wrap" ref={wrap}>
        <table className="ak-table" aria-labelledby={`${id}-label`} aria-describedby={describedBy}>
          <thead>
            <tr>
              {shape.columns.map((c, i) => (
                <th key={i} scope="col" className={shape.numeric[i] ? "ak-num-col" : undefined}>
                  {c}
                </th>
              ))}
              {!shape.fixedRows && !readOnly ? (
                <th scope="col">
                  <span className="ak-visually-hidden">Remove</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {shape.columns.map((col, c) => {
                  const cid = `${id}-r${r}-c${c}`;
                  const name = `${col}, ${rowName(r)}`;
                  if (shape.fixedRows && c === 0) {
                    return (
                      <th key={c} scope="row" className="ak-table-rowhead">
                        {row[0] as string}
                      </th>
                    );
                  }
                  return (
                    <td key={c} className={shape.numeric[c] ? "ak-num-col" : undefined}>
                      <span className="ak-table-celllabel" aria-hidden="true">
                        {col}
                      </span>
                      {shape.numeric[c] ? (
                        <NumberBox
                          field={cellDef}
                          value={typeof row[c] === "number" ? (row[c] as number) : null}
                          onChange={(n) => setCell(r, c, n)}
                          readOnly={readOnly}
                          id={cid}
                          ariaLabel={name}
                        />
                      ) : (
                        <input
                          className="ak-input"
                          type="text"
                          id={cid}
                          aria-label={name}
                          maxLength={TABLE_CELL_MAX_CHARS}
                          value={typeof row[c] === "string" ? (row[c] as string) : ""}
                          readOnly={readOnly}
                          onChange={(e) => setCell(r, c, e.target.value)}
                        />
                      )}
                    </td>
                  );
                })}
                {!shape.fixedRows && !readOnly ? (
                  <td className="ak-table-act">
                    {canRemove ? (
                      <button type="button" className="ak-btn ak-btn-quiet ak-btn-icon" aria-label={`Remove row ${r + 1}`} onClick={() => remove(r)}>
                        <span aria-hidden="true">×</span>
                        <span className="ak-table-act-text" aria-hidden="true">
                          Remove row
                        </span>
                      </button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
          {totals ? (
            <tfoot>
              <tr>
                {shape.columns.map((col, c) =>
                  c === 0 ? (
                    <th key={c} scope="row">
                      {totalLabel(field)}
                    </th>
                  ) : (
                    <td key={c} className={shape.numeric[c] ? "ak-num-col" : undefined}>
                      <span className="ak-table-celllabel" aria-hidden="true">
                        {col}
                      </span>
                      <output htmlFor={rows.map((_, r) => `${id}-r${r}-c${c}`).join(" ")} aria-label={`${totalLabel(field)}, ${col}`}>
                        {totals[c] === null || totals[c] === undefined ? "" : formatCell(field, c, totals[c] as number)}
                      </output>
                    </td>
                  ),
                )}
                {!shape.fixedRows && !readOnly ? <td /> : null}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      {canAdd ? (
        <button type="button" className="ak-btn ak-btn-quiet" ref={addBtn} onClick={add}>
          Add a row
        </button>
      ) : null}
      {!shape.fixedRows && !readOnly ? (
        <p className="ak-muted ak-small">
          {rows.length} of {shape.maxRows} rows.
        </p>
      ) : null}
    </FieldShell>
  );
}
