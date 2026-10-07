import type { Field } from "@akana/schema";

/**
 * Pure helpers for the four v3 field types added for non-wellbeing genres
 * (F-113): number, currency, table and decision matrix. No React here, so the
 * app's export and the validator can use the same rules as the renderers.
 *
 * Saved shapes (all plain JSON, sealed as one value per field):
 *
 *   number, currency  number | null
 *                     A currency amount is in major units (pounds, naira),
 *                     rounded to the currency's minor units when saved.
 *   table             (string | number | null)[][]
 *                     One array per row, one cell per column. Text columns
 *                     hold strings. When the field computes a total, every
 *                     column after the first is a number column and holds
 *                     number | null. With fixed rows, cell 0 is the row label.
 *   decision_matrix   { options: string[], weights: (number | null)[], scores: (number | null)[][] }
 *                     options are the choices being compared (the author's,
 *                     or the reader's own names). weights hold one importance
 *                     per criterion, 1 to 5, used only by weighted_sum.
 *                     scores[option][criterion] sit on the field's scale.
 */

export type NumberValue = number | null;
export type TableCell = string | number | null;
export type TableValue = TableCell[][];
export interface DecisionMatrixValue {
  options: string[];
  weights: (number | null)[];
  scores: (number | null)[][];
}

/** The fields this file needs. A full schema Field fits. */
export type FieldDef = Pick<
  Field,
  "type" | "label" | "columns" | "rows" | "options" | "min_items" | "max_items" | "min" | "max" | "step" | "unit" | "computed"
>;

export const DEFAULT_LOCALE = "en-GB";

// ---------------------------------------------------------------------------
// Numbers and money
// ---------------------------------------------------------------------------

const CURRENCY_RE = /^[A-Z]{3}$/;

/** A three-letter ISO 4217 code the runtime knows. */
export function isCurrencyCode(unit: string | undefined): unit is string {
  if (!unit || !CURRENCY_RE.test(unit)) return false;
  try {
    new Intl.NumberFormat(DEFAULT_LOCALE, { style: "currency", currency: unit });
    return true;
  } catch {
    return false;
  }
}

/** Minor-unit digits for a currency: 2 for GBP, 0 for JPY. 2 when unknown. */
export function currencyDigits(code: string | undefined): number {
  if (!isCurrencyCode(code)) return 2;
  return new Intl.NumberFormat(DEFAULT_LOCALE, { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
}

/** The symbol a reader expects beside the box, such as £ or ₦. Falls back to the code. */
export function currencySymbol(code: string | undefined, locale = DEFAULT_LOCALE): string {
  if (!isCurrencyCode(code)) return code ?? "";
  const part = new Intl.NumberFormat(locale, { style: "currency", currency: code, currencyDisplay: "narrowSymbol" })
    .formatToParts(0)
    .find((p) => p.type === "currency");
  return part?.value ?? code;
}

export function roundTo(value: number, digits: number): number {
  const f = 10 ** digits;
  // Round half away from zero on the decimal string, not the binary float.
  return Math.sign(value) * (Math.round(Number(`${Math.abs(value)}e${digits}`)) / f);
}

export type ParseResult = { ok: true; value: number | null } | { ok: false };

/**
 * Read what a reader typed. Accepts thousands separators, spaces, a leading
 * currency symbol or code, a minus sign and a decimal point. Blank is null.
 * Anything else is not a number.
 */
export function parseNumberInput(text: string): ParseResult {
  let s = text.trim();
  if (s === "") return { ok: true, value: null };
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (s.startsWith("-") || s.startsWith("−")) {
    negative = !negative;
    s = s.slice(1).trim();
  }
  // Drop a currency code or symbol at either end.
  s = s.replace(/^[A-Za-z]{3}\s*/, "").replace(/\s*[A-Za-z]{3}$/, "");
  s = s.replace(/^[^\d.,\s-]+/, "").replace(/[^\d.,\s]+$/, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  s = s.replace(/[\s,  ]/g, "");
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return { ok: false };
  const n = Number(s);
  if (!Number.isFinite(n)) return { ok: false };
  return { ok: true, value: negative ? -n : n };
}

/** Digits a number field keeps: from its step, so 0.5 keeps one. */
function stepDigits(step: number | undefined): number {
  if (!step) return 6;
  const s = String(step);
  const dot = s.indexOf(".");
  return dot < 0 ? 0 : Math.min(6, s.length - dot - 1);
}

/** How many decimal places a value of this field keeps when saved. */
export function fieldDigits(field: FieldDef): number {
  if (field.type === "currency") return currencyDigits(field.unit);
  return stepDigits(field.step);
}

/**
 * Round a typed number to what the field keeps. Money rounds to its minor
 * units. A plain number is never rounded to its step (2.5 people stays 2.5
 * and gets a message); only float noise is trimmed.
 */
export function normaliseNumber(field: FieldDef, value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (field.type === "currency") return roundTo(value, currencyDigits(field.unit));
  return roundTo(value, 6);
}

/**
 * A plain message when a number does not fit the field, or null when it does.
 * The renderer keeps the reader's typing on screen and saves nothing until it
 * fits, so a half-typed figure never overwrites a good one.
 */
export function numberProblem(field: FieldDef, value: number | null): string | null {
  if (value === null) return null;
  const fmt = (n: number) => formatNumber(field, n);
  if (field.min !== undefined && field.max !== undefined && (value < field.min || value > field.max)) {
    return `Use a figure from ${fmt(field.min)} to ${fmt(field.max)}.`;
  }
  if (field.min !== undefined && value < field.min) return `Use a figure of ${fmt(field.min)} or more.`;
  if (field.max !== undefined && value > field.max) return `Use a figure of ${fmt(field.max)} or less.`;
  if (field.type === "number" && field.step !== undefined && Number.isInteger(field.step) && !Number.isInteger(value)) {
    return "Use a whole number.";
  }
  return null;
}

/** A number as a reader would write it: grouped, with the currency or unit. */
export function formatNumber(field: FieldDef, value: number, locale = DEFAULT_LOCALE): string {
  if (field.type === "currency" || (field.type !== "number" && isCurrencyCode(field.unit))) {
    if (isCurrencyCode(field.unit)) {
      const d = currencyDigits(field.unit);
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: field.unit,
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      }).format(value);
    }
    const plain = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    return field.unit ? `${plain} ${field.unit}` : plain;
  }
  const plain = new Intl.NumberFormat(locale, { maximumFractionDigits: Math.min(6, fieldDigits(field)) }).format(value);
  return field.unit && field.type === "number" ? `${plain} ${field.unit}` : plain;
}

/** The figure shown in the box while not editing: grouped, no symbol (the symbol sits beside it). */
export function formatForInput(field: FieldDef, value: number | null, locale = DEFAULT_LOCALE): string {
  if (value === null) return "";
  const d = fieldDigits(field);
  if (field.type === "currency" || (field.type !== "number" && isCurrencyCode(field.unit))) {
    const digits = isCurrencyCode(field.unit) ? d : 2;
    return new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: Math.min(6, d) }).format(value);
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export const TABLE_MAX_ROWS = 20;
export const TABLE_MAX_COLUMNS = 6;
/**
 * Longest text a table cell or an option name takes. With 20 rows of 6
 * columns, the fullest table stays under the 32 KB sealed answer limit even
 * in a script that needs 3 bytes a character.
 */
export const TABLE_CELL_MAX_CHARS = 80;
export const MATRIX_NAME_MAX_CHARS = 60;

export interface TableShape {
  columns: string[];
  /** Author-given row labels. When present, rows are fixed and cell 0 is the label. */
  fixedRows: string[] | null;
  minRows: number;
  maxRows: number;
  /** Which columns hold numbers. Set by computed: every column after the first. */
  numeric: boolean[];
  computed: "sum" | "mean" | null;
  /** Number columns read as money when the field's unit is a currency code. */
  currency: string | null;
}

export function tableShape(field: FieldDef): TableShape {
  const columns = field.columns && field.columns.length ? field.columns.slice(0, TABLE_MAX_COLUMNS) : ["Item", "Detail"];
  const computed = field.computed === "mean" ? "mean" : field.computed ? "sum" : null;
  const numeric = columns.map((_, i) => computed !== null && i > 0);
  const fixedRows = field.rows && field.rows.length ? field.rows.slice(0, TABLE_MAX_ROWS) : null;
  if (fixedRows) {
    return { columns, fixedRows, minRows: fixedRows.length, maxRows: fixedRows.length, numeric, computed, currency: isCurrencyCode(field.unit) ? field.unit : null };
  }
  const maxRows = Math.max(1, Math.min(TABLE_MAX_ROWS, field.max_items ?? 10));
  const minRows = Math.max(1, Math.min(maxRows, field.min_items ?? 1));
  return { columns, fixedRows: null, minRows, maxRows, numeric, computed, currency: isCurrencyCode(field.unit) ? field.unit : null };
}

/** An empty row in the shape the table expects. */
export function emptyRow(shape: TableShape, label?: string): TableCell[] {
  return shape.columns.map((_, i) => (i === 0 && label !== undefined ? label : shape.numeric[i] ? null : ""));
}

export function defaultTable(field: FieldDef): TableValue {
  const shape = tableShape(field);
  if (shape.fixedRows) return shape.fixedRows.map((r) => emptyRow(shape, r));
  return Array.from({ length: shape.minRows }, () => emptyRow(shape));
}

function cellAs(shape: TableShape, i: number, cell: unknown): TableCell {
  if (shape.numeric[i]) {
    if (typeof cell === "number" && Number.isFinite(cell)) return cell;
    if (typeof cell === "string") {
      const p = parseNumberInput(cell);
      return p.ok ? p.value : null;
    }
    return null;
  }
  if (typeof cell === "string") return cell;
  if (typeof cell === "number" && Number.isFinite(cell)) return String(cell);
  return "";
}

/** Fit a stored table to the field: right columns, row count within bounds, labels re-applied. */
export function coerceTable(field: FieldDef, stored: unknown): TableValue {
  const shape = tableShape(field);
  if (!Array.isArray(stored) || !stored.every(Array.isArray)) return defaultTable(field);
  const rows = stored as unknown[][];
  if (shape.fixedRows) {
    return shape.fixedRows.map((label, r) => shape.columns.map((_, i) => (i === 0 ? label : cellAs(shape, i, rows[r]?.[i]))));
  }
  const fitted = rows.slice(0, shape.maxRows).map((row) => shape.columns.map((_, i) => cellAs(shape, i, row[i])));
  while (fitted.length < shape.minRows) fitted.push(emptyRow(shape));
  return fitted;
}

const cellFilled = (c: TableCell) => (typeof c === "number" ? true : typeof c === "string" ? c.trim().length > 0 : false);

/** Rows the reader has written in. A fixed row counts only for its non-label cells. */
export function filledRows(field: FieldDef, value: TableValue): number[] {
  const shape = tableShape(field);
  const start = shape.fixedRows ? 1 : 0;
  return value.flatMap((row, r) => (row.slice(start).some(cellFilled) ? [r] : []));
}

/** Total (or mean) per column. null for text columns and for number columns with nothing in. */
export function tableTotals(field: FieldDef, value: TableValue): (number | null)[] {
  const shape = tableShape(field);
  return shape.columns.map((_, i) => {
    if (!shape.numeric[i]) return null;
    const nums = value.map((row) => row[i]).filter((c): c is number => typeof c === "number" && Number.isFinite(c));
    if (!nums.length) return null;
    const d = shape.currency ? currencyDigits(shape.currency) : 6;
    // Sum in minor units so money adds up exactly.
    const scale = 10 ** Math.min(d, 6);
    const sum = nums.reduce((a, b) => a + Math.round(b * scale), 0) / scale;
    if (shape.computed === "mean") return roundTo(sum / nums.length, Math.min(d, 2));
    return sum;
  });
}

/** One table cell for display. */
export function formatCell(field: FieldDef, columnIndex: number, cell: TableCell, locale = DEFAULT_LOCALE): string {
  const shape = tableShape(field);
  if (cell === null) return "";
  if (typeof cell === "number") {
    if (shape.currency) return formatNumber({ type: "currency", label: "", unit: shape.currency }, cell, locale);
    return formatNumber({ type: "number", label: "" }, cell, locale);
  }
  void columnIndex;
  return cell;
}

export function totalLabel(field: FieldDef): string {
  return field.computed === "mean" ? "Average" : "Total";
}

// ---------------------------------------------------------------------------
// Decision matrix
// ---------------------------------------------------------------------------

export const MATRIX_MAX_OPTIONS = 8;
export const WEIGHT_MIN = 1;
export const WEIGHT_MAX = 5;

export interface MatrixShape {
  criteria: string[];
  /** Author-given choices, or null when the reader names their own. */
  fixedOptions: string[] | null;
  minOptions: number;
  maxOptions: number;
  scaleMin: number;
  scaleMax: number;
  computed: "sum" | "mean" | "weighted_sum";
}

export function matrixShape(field: FieldDef): MatrixShape {
  const criteria = field.columns && field.columns.length ? field.columns : ["Criterion 1", "Criterion 2"];
  const given = field.options?.length ? field.options : field.rows?.length ? field.rows : null;
  const fixedOptions = given ? given.slice(0, MATRIX_MAX_OPTIONS) : null;
  const intOr = (n: number | undefined, d: number) => (n !== undefined && Number.isInteger(n) ? n : d);
  let scaleMin = Math.max(0, intOr(field.min, 1));
  let scaleMax = Math.min(10, intOr(field.max, 5));
  if (scaleMax <= scaleMin) [scaleMin, scaleMax] = [1, 5];
  const maxOptions = fixedOptions ? fixedOptions.length : Math.max(2, Math.min(MATRIX_MAX_OPTIONS, field.max_items ?? 4));
  const minOptions = fixedOptions ? fixedOptions.length : Math.max(2, Math.min(maxOptions, field.min_items ?? 2));
  return { criteria, fixedOptions, minOptions, maxOptions, scaleMin, scaleMax, computed: field.computed ?? "sum" };
}

export function defaultMatrix(field: FieldDef): DecisionMatrixValue {
  const s = matrixShape(field);
  const options = s.fixedOptions ? [...s.fixedOptions] : Array.from({ length: s.minOptions }, () => "");
  return {
    options,
    weights: s.criteria.map(() => null),
    scores: options.map(() => s.criteria.map(() => null)),
  };
}

const inScale = (n: unknown, lo: number, hi: number): number | null =>
  typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi ? n : null;

export function coerceMatrix(field: FieldDef, stored: unknown): DecisionMatrixValue {
  const s = matrixShape(field);
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return defaultMatrix(field);
  const v = stored as Partial<Record<keyof DecisionMatrixValue, unknown>>;
  const rawOptions = Array.isArray(v.options) ? v.options.map((o) => (typeof o === "string" ? o : "")) : [];
  const options = s.fixedOptions
    ? [...s.fixedOptions]
    : (() => {
        const o = rawOptions.slice(0, s.maxOptions);
        while (o.length < s.minOptions) o.push("");
        return o;
      })();
  const rawWeights = Array.isArray(v.weights) ? v.weights : [];
  const rawScores = Array.isArray(v.scores) ? v.scores : [];
  return {
    options,
    weights: s.criteria.map((_, c) => inScale(rawWeights[c], WEIGHT_MIN, WEIGHT_MAX)),
    scores: options.map((_, o) => {
      const row = Array.isArray(rawScores[o]) ? (rawScores[o] as unknown[]) : [];
      return s.criteria.map((_, c) => inScale(row[c], s.scaleMin, s.scaleMax));
    }),
  };
}

export interface OptionScore {
  index: number;
  name: string;
  /** null until at least one criterion has a score. */
  score: number | null;
  /** Every criterion has a score. */
  complete: boolean;
}

/** Options the reader can see: author choices, or the ones the reader has named. */
export function namedOptions(field: FieldDef, value: DecisionMatrixValue): number[] {
  const s = matrixShape(field);
  return value.options.flatMap((o, i) => (s.fixedOptions || o.trim() ? [i] : []));
}

/**
 * Score per option. sum adds the scores; mean averages the scored criteria;
 * weighted_sum multiplies each score by that criterion's importance (a blank
 * importance counts as 1) and adds them up.
 */
export function matrixScores(field: FieldDef, value: DecisionMatrixValue): OptionScore[] {
  const s = matrixShape(field);
  return value.options.map((name, o) => {
    const row = value.scores[o] ?? [];
    const scored = s.criteria.flatMap((_, c) => (typeof row[c] === "number" ? [{ c, n: row[c] as number }] : []));
    let score: number | null = null;
    if (scored.length) {
      if (s.computed === "mean") score = roundTo(scored.reduce((a, x) => a + x.n, 0) / scored.length, 1);
      else if (s.computed === "weighted_sum") score = scored.reduce((a, x) => a + x.n * (value.weights[x.c] ?? 1), 0);
      else score = scored.reduce((a, x) => a + x.n, 0);
    }
    return { index: o, name: s.fixedOptions ? name : name.trim(), score, complete: scored.length === s.criteria.length };
  });
}

/** The highest-scoring named options, or [] when nothing is scored. Ties return all of them. */
export function matrixLeaders(field: FieldDef, value: DecisionMatrixValue): OptionScore[] {
  const named = new Set(namedOptions(field, value));
  const scores = matrixScores(field, value).filter((o) => named.has(o.index) && o.score !== null);
  if (!scores.length) return [];
  const top = Math.max(...scores.map((o) => o.score as number));
  return scores.filter((o) => o.score === top);
}

export function formatScore(n: number | null): string {
  if (n === null) return "";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function computedLabel(shape: MatrixShape): string {
  if (shape.computed === "mean") return "Average score";
  if (shape.computed === "weighted_sum") return "Weighted score";
  return "Total score";
}

// ---------------------------------------------------------------------------
// Answered, plain text and print
// ---------------------------------------------------------------------------

export function tableAnswered(field: FieldDef, value: TableValue): boolean {
  return filledRows(field, value).length > 0;
}

/** Answered when at least two options are named and every named option has every score. */
export function matrixAnswered(field: FieldDef, value: DecisionMatrixValue): boolean {
  const named = namedOptions(field, value);
  if (named.length < 2) return false;
  return named.every((o) => (value.scores[o] ?? []).every((n) => n !== null));
}

/** A printable view of a saved value: lines of text, or a table with an optional foot. */
export type Printable =
  | { kind: "lines"; lines: string[] }
  | { kind: "table"; head: string[]; rows: string[][]; foot: string[] | null; caption: string | null };

export function printableValue(field: FieldDef, stored: unknown, locale = DEFAULT_LOCALE): Printable {
  switch (field.type) {
    case "number":
    case "currency": {
      const n = typeof stored === "number" && Number.isFinite(stored) ? stored : null;
      return { kind: "lines", lines: n === null ? [] : [formatNumber(field, n, locale)] };
    }
    case "table": {
      const value = coerceTable(field, stored);
      const shape = tableShape(field);
      const keep = new Set(filledRows(field, value));
      const rows = value.filter((_, r) => keep.has(r)).map((row) => row.map((c, i) => formatCell(field, i, c, locale)));
      if (!rows.length) return { kind: "lines", lines: [] };
      const totals = shape.computed ? tableTotals(field, value) : null;
      const foot = totals
        ? totals.map((t, i) => (i === 0 ? totalLabel(field) : t === null ? "" : formatCell(field, i, t, locale)))
        : null;
      return { kind: "table", head: shape.columns, rows, foot, caption: null };
    }
    case "decision_matrix": {
      const value = coerceMatrix(field, stored);
      const shape = matrixShape(field);
      const named = namedOptions(field, value);
      if (!named.length || named.every((o) => (value.scores[o] ?? []).every((n) => n === null))) return { kind: "lines", lines: [] };
      const scores = matrixScores(field, value);
      const weighted = shape.computed === "weighted_sum";
      const head = ["Option", ...shape.criteria.map((c, i) => (weighted ? `${c} (importance ${value.weights[i] ?? 1})` : c)), computedLabel(shape)];
      const rows = named.map((o) => [
        scores[o]?.name ?? "",
        ...shape.criteria.map((_, c) => formatScore(value.scores[o]?.[c] ?? null)),
        formatScore(scores[o]?.score ?? null),
      ]);
      const leaders = matrixLeaders(field, value);
      const caption = leaders.length ? `Highest score: ${leaders.map((l) => l.name).join(" and ")}` : null;
      return { kind: "table", head, rows, foot: null, caption };
    }
    default:
      return { kind: "lines", lines: [] };
  }
}

/** One plain line for My plan and the then-and-now card. */
export function plainText(field: FieldDef, stored: unknown, locale = DEFAULT_LOCALE): string {
  const p = printableValue(field, stored, locale);
  if (p.kind === "lines") return p.lines.join("; ");
  if (field.type === "decision_matrix") return p.caption ?? "";
  const lines = p.rows.map((r) => r.filter(Boolean).join(", ")).filter(Boolean);
  if (p.foot) lines.push(p.foot.filter(Boolean).join(" "));
  return lines.join("; ");
}
