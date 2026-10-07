"use client";

import { useRef } from "react";
import type { FieldProps } from "../types";
import {
  computedLabel,
  formatScore,
  matrixLeaders,
  matrixScores,
  matrixShape,
  MATRIX_NAME_MAX_CHARS,
  WEIGHT_MAX,
  WEIGHT_MIN,
  type DecisionMatrixValue,
} from "../values";
import { FieldHead, FieldShell } from "./common";

const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

/**
 * Compare a few options against a few criteria (field.columns). Options are
 * the author's (field.options) or named by the reader, between min_items and
 * max_items. Each option is a card with one score per criterion, on the
 * field's scale (min to max, 1 to 5 by default). weighted_sum adds a row of
 * importances, 1 to 5, above the cards.
 *
 * Scores use native selects: one Tab stop each, arrow keys change the value,
 * and they are 44px tall. The score line under each card and the summary are
 * plain text, so nothing announces on every change.
 */
export function DecisionMatrix({ field, value, onChange, readOnly, controlId }: FieldProps<"decision_matrix">) {
  const id = controlId ?? field.id;
  const shape = matrixShape(field);
  const wrap = useRef<HTMLDivElement>(null);
  const addBtn = useRef<HTMLButtonElement>(null);
  const scores = matrixScores(field, value);
  const leaders = matrixLeaders(field, value);
  const scale = range(shape.scaleMin, shape.scaleMax);
  const weighted = shape.computed === "weighted_sum";

  const clone = (): DecisionMatrixValue => ({
    options: [...value.options],
    weights: [...value.weights],
    scores: value.scores.map((r) => [...r]),
  });
  const setScore = (o: number, c: number, n: number | null) => {
    const next = clone();
    const row = next.scores[o];
    if (row) row[c] = n;
    onChange(next);
  };
  const setWeight = (c: number, n: number | null) => {
    const next = clone();
    next.weights[c] = n;
    onChange(next);
  };
  const setName = (o: number, name: string) => {
    const next = clone();
    next.options[o] = name;
    onChange(next);
  };
  const canAdd = !readOnly && !shape.fixedOptions && value.options.length < shape.maxOptions;
  const canRemove = !readOnly && !shape.fixedOptions && value.options.length > shape.minOptions;
  const focusName = (o: number) =>
    requestAnimationFrame(() => {
      const el = wrap.current?.ownerDocument.getElementById(`${id}-o${o}-name`);
      if (el) el.focus();
      else addBtn.current?.focus();
    });
  const add = () => {
    const next = clone();
    next.options.push("");
    next.scores.push(shape.criteria.map(() => null));
    onChange(next);
    focusName(value.options.length);
  };
  const remove = (o: number) => {
    const next = clone();
    next.options.splice(o, 1);
    next.scores.splice(o, 1);
    onChange(next);
    focusName(Math.max(0, o - 1));
  };

  const optionName = (o: number) => {
    const n = value.options[o]?.trim();
    return n ? n : `Option ${o + 1}`;
  };
  const parse = (s: string) => (s === "" ? null : Number(s));

  return (
    <FieldShell type="decision_matrix">
      <FieldHead field={field} id={`${id}-label`} />
      <p className="ak-muted ak-small" id={`${id}-scale`}>
        Score each option from {shape.scaleMin} to {shape.scaleMax}. {shape.scaleMax} fits best.
      </p>
      <div className="ak-matrix" ref={wrap} role="group" aria-labelledby={`${id}-label`} aria-describedby={`${id}-scale`}>
        {weighted ? (
          <fieldset className="ak-matrix-card ak-matrix-weights">
            <legend className="ak-matrix-legend">How much each one matters</legend>
            <p className="ak-muted ak-small">
              From {WEIGHT_MIN} to {WEIGHT_MAX}. One you leave blank counts as {WEIGHT_MIN}.
            </p>
            <div className="ak-matrix-grid">
              {shape.criteria.map((c, ci) => (
                <div className="ak-matrix-cell" key={ci}>
                  <label htmlFor={`${id}-w${ci}`}>{c}</label>
                  <select
                    className="ak-select"
                    id={`${id}-w${ci}`}
                    value={value.weights[ci] ?? ""}
                    disabled={readOnly}
                    onChange={(e) => setWeight(ci, parse(e.target.value))}
                  >
                    <option value="">Not set</option>
                    {range(WEIGHT_MIN, WEIGHT_MAX).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </fieldset>
        ) : null}

        {value.options.map((_, o) => {
          const fixed = shape.fixedOptions !== null;
          const s = scores[o];
          return (
            <fieldset className="ak-matrix-card" key={o}>
              {fixed ? (
                <legend className="ak-matrix-legend" id={`${id}-o${o}-legend`}>
                  {value.options[o]}
                </legend>
              ) : (
                <>
                  <legend className="ak-visually-hidden">{optionName(o)}</legend>
                  <label className="ak-matrix-legend" htmlFor={`${id}-o${o}-name`}>
                    Option {o + 1}
                    <span className="ak-visually-hidden">, name</span>
                  </label>
                  <input
                    className="ak-input"
                    type="text"
                    id={`${id}-o${o}-name`}
                    maxLength={MATRIX_NAME_MAX_CHARS}
                    value={value.options[o] ?? ""}
                    readOnly={readOnly}
                    onChange={(e) => setName(o, e.target.value)}
                  />
                </>
              )}
              <div className="ak-matrix-grid">
                {shape.criteria.map((c, ci) => (
                  <div className="ak-matrix-cell" key={ci}>
                    <label htmlFor={`${id}-o${o}-c${ci}`}>
                      {c}
                      <span className="ak-visually-hidden">, {optionName(o)}</span>
                    </label>
                    <select
                      className="ak-select"
                      id={`${id}-o${o}-c${ci}`}
                      value={value.scores[o]?.[ci] ?? ""}
                      disabled={readOnly}
                      onChange={(e) => setScore(o, ci, parse(e.target.value))}
                    >
                      <option value="">Not scored</option>
                      {scale.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <p className="ak-matrix-score">
                {computedLabel(shape)}: <b>{s && s.score !== null ? formatScore(s.score) : "not yet"}</b>
              </p>
              {canRemove ? (
                <button type="button" className="ak-btn ak-btn-quiet" onClick={() => remove(o)} aria-label={`Remove ${optionName(o)}`}>
                  Remove this option
                </button>
              ) : null}
            </fieldset>
          );
        })}
      </div>
      {canAdd ? (
        <button type="button" className="ak-btn ak-btn-quiet" ref={addBtn} onClick={add}>
          Add an option
        </button>
      ) : null}
      {leaders.length ? (
        <p className="ak-note" data-matrix-leader>
          Highest score so far: {leaders.map((l) => l.name || `Option ${l.index + 1}`).join(" and ")}. The score is a guide. The choice is yours.
        </p>
      ) : null}
    </FieldShell>
  );
}
