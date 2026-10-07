"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { FieldProps } from "../types";
import {
  currencySymbol,
  formatForInput,
  normaliseNumber,
  numberProblem,
  parseNumberInput,
  type FieldDef,
} from "../values";
import { FieldHead, FieldShell } from "./common";

interface NumberBoxProps {
  field: FieldDef & { id?: string };
  value: number | null;
  onChange: (value: number | null) => void;
  readOnly?: boolean;
  id: string;
  /** Accessible name when no visible label points at the box (table cells). */
  ariaLabel?: string;
  describedBy?: string;
  /** Show the currency symbol or unit beside the box. */
  showAffix?: boolean;
  className?: string;
}

/**
 * A text box that takes a number. type="text" with inputmode="decimal" rather
 * than type="number": the browser's spinner and scroll-to-change are easy to
 * trip on a phone, and it refuses thousands separators readers type.
 *
 * Keyboard: Up and Down arrows add or take away one step (Shift for ten).
 * Typing saves as soon as the figure fits the field. A figure that does not
 * fit stays on screen with a message and is not saved.
 */
export function NumberBox({ field, value, onChange, readOnly, id, ariaLabel, describedBy, showAffix = true, className }: NumberBoxProps) {
  const [draft, setDraft] = useState<string>(() => formatForInput(field, value));
  const [problem, setProblem] = useState<string | null>(null);
  const focused = useRef(false);

  // Follow outside changes (a prefill, a reload) while the reader is not typing.
  useEffect(() => {
    if (!focused.current) setDraft(formatForInput(field, value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = (text: string) => {
    const parsed = parseNumberInput(text);
    if (!parsed.ok) {
      setProblem("Use numbers only, for example 1250.50.");
      return;
    }
    const n = normaliseNumber(field, parsed.value);
    const p = numberProblem(field, n);
    setProblem(p);
    if (!p && n !== value) onChange(n);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (readOnly || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    const parsed = parseNumberInput(draft);
    const base = parsed.ok && parsed.value !== null ? parsed.value : (field.min ?? 0);
    const step = (field.step ?? 1) * (e.shiftKey ? 10 : 1);
    let next = normaliseNumber(field, base + (e.key === "ArrowUp" ? step : -step)) ?? 0;
    if (field.min !== undefined) next = Math.max(field.min, next);
    if (field.max !== undefined) next = Math.min(field.max, next);
    setDraft(String(next));
    commit(String(next));
  };

  const currency = field.type === "currency";
  const prefix = showAffix && currency ? currencySymbol(field.unit) : "";
  const suffix = showAffix && !currency && field.type === "number" && field.unit ? field.unit : "";
  const problemId = `${id}-problem`;
  const described = [describedBy, problem ? problemId : undefined].filter(Boolean).join(" ") || undefined;

  return (
    <>
      <div className={`ak-num${className ? ` ${className}` : ""}`}>
        {prefix ? (
          <span className="ak-num-affix" aria-hidden="true">
            {prefix}
          </span>
        ) : null}
        <input
          className="ak-input ak-input-num"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          id={id}
          aria-label={ariaLabel}
          aria-describedby={described}
          aria-invalid={problem ? true : undefined}
          value={draft}
          readOnly={readOnly}
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={() => {
            focused.current = false;
            const parsed = parseNumberInput(draft);
            if (parsed.ok && !numberProblem(field, normaliseNumber(field, parsed.value))) {
              setDraft(formatForInput(field, normaliseNumber(field, parsed.value)));
            }
          }}
          onChange={(e) => {
            setDraft(e.target.value);
            commit(e.target.value);
          }}
          onKeyDown={onKeyDown}
        />
        {suffix ? (
          <span className="ak-num-affix" aria-hidden="true">
            {suffix}
          </span>
        ) : null}
      </div>
      {problem ? (
        <p className="ak-field-problem ak-small" id={problemId} role="status">
          {problem}
        </p>
      ) : null}
    </>
  );
}

/** Help line naming the unit and range, so the symbol beside the box is never the only cue. */
function rangeHint(field: FieldDef): string | null {
  const parts: string[] = [];
  if (field.type === "currency" && field.unit) parts.push(`Amount in ${field.unit}.`);
  if (field.type === "number" && field.unit) parts.push(`In ${field.unit}.`);
  return parts.length ? parts.join(" ") : null;
}

export function NumberField({ field, value, onChange, readOnly, controlId }: FieldProps<"number">) {
  const id = controlId ?? field.id;
  const hint = rangeHint(field);
  return (
    <FieldShell type="number">
      <FieldHead field={field} htmlFor={id} />
      {hint ? (
        <p className="ak-visually-hidden" id={`${id}-unit`}>
          {hint}
        </p>
      ) : null}
      <NumberBox
        field={field}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        id={id}
        describedBy={[field.help ? `${id}-help` : "", hint ? `${id}-unit` : ""].filter(Boolean).join(" ") || undefined}
      />
    </FieldShell>
  );
}

export function CurrencyField({ field, value, onChange, readOnly, controlId }: FieldProps<"currency">) {
  const id = controlId ?? field.id;
  const hint = rangeHint(field);
  return (
    <FieldShell type="currency">
      <FieldHead field={field} htmlFor={id} />
      {hint ? (
        <p className="ak-visually-hidden" id={`${id}-unit`}>
          {hint}
        </p>
      ) : null}
      <NumberBox
        field={field}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        id={id}
        describedBy={[field.help ? `${id}-help` : "", hint ? `${id}-unit` : ""].filter(Boolean).join(" ") || undefined}
      />
    </FieldShell>
  );
}
