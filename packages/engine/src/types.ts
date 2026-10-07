import type { Field, FieldType } from "@akana/schema";
import {
  coerceMatrix,
  coerceTable,
  defaultMatrix,
  defaultTable,
  matrixAnswered,
  tableAnswered,
  type DecisionMatrixValue,
  type NumberValue,
  type TableValue,
} from "./values";

export type { DecisionMatrixValue, NumberValue, TableCell, TableValue } from "./values";

/**
 * Answer shapes, one per field type. These mirror what the legacy engine kept
 * in S.answers, tidied so every shape is a plain JSON value with a fixed
 * layout. Sealing and persistence happen in the app, not here.
 */
export type TextValue = string;
export type ScaleValue = number | null;
export type YesNoValue = "yes" | "no" | null;
export type ChecklistValue = boolean[];
export type RankedListValue = string[];
export type TwoColumnValue = string[][];
/** One rating per row, 1 to 5, or null when not yet rated. */
export type RatingGridValue = (number | null)[];
/**
 * Without rows: seven booleans, Monday first.
 * With rows: seven days, each a list of ratings per row (1 to 5 or null).
 */
export type WeeklyGridValue = boolean[] | (number | null)[][];
/** Kept for callers that named it. No field type is pending since F-113. */
export type PendingValue = null;

export type FieldValue =
  | TextValue
  | ScaleValue
  | YesNoValue
  | ChecklistValue
  | RankedListValue
  | TwoColumnValue
  | RatingGridValue
  | WeeklyGridValue
  | NumberValue
  | TableValue
  | DecisionMatrixValue
  | PendingValue;

export type FieldValueOf<T extends FieldType> = T extends "short_text" | "long_text" | "time_of_day"
  ? TextValue
  : T extends "scale_0_10"
    ? ScaleValue
    : T extends "yes_no"
      ? YesNoValue
      : T extends "checklist"
        ? ChecklistValue
        : T extends "ranked_list"
          ? RankedListValue
          : T extends "two_column"
            ? TwoColumnValue
            : T extends "rating_grid"
              ? RatingGridValue
              : T extends "weekly_grid"
                ? WeeklyGridValue
                : T extends "number" | "currency"
                  ? NumberValue
                  : T extends "table"
                    ? TableValue
                    : T extends "decision_matrix"
                      ? DecisionMatrixValue
                      : PendingValue;

/**
 * Field types that render as a labelled placeholder. Empty since F-113 gave
 * number, currency, table and decision_matrix their renderers. Kept so the
 * harness keeps a slot for any future declared-but-unbuilt type.
 */
export const PENDING_FIELD_TYPES: readonly FieldType[] = [];
export type PendingFieldType = FieldType;

export function isPendingFieldType(type: string): type is PendingFieldType {
  return (PENDING_FIELD_TYPES as readonly string[]).includes(type);
}

export const DAYS_LONG = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const DAYS_SHORT = ["M", "T", "W", "T", "F", "S", "S"] as const;
export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** Props every field component takes. */
export interface FieldProps<T extends FieldType = FieldType> {
  field: Field & { type: T };
  value: FieldValueOf<T>;
  onChange: (value: FieldValueOf<T>) => void;
  readOnly?: boolean;
  /** Stable id for the control, used for label association. Defaults to field.id. */
  controlId?: string;
}

/** Thrown by FieldRenderer for a type it does not know. */
export class UnknownFieldError extends Error {
  readonly fieldId: string;
  readonly fieldType: string;
  constructor(fieldId: string, fieldType: string) {
    super(`Unknown field type "${fieldType}" on field "${fieldId}"`);
    this.name = "UnknownFieldError";
    this.fieldId = fieldId;
    this.fieldType = fieldType;
  }
}

/**
 * Answers come in and go out through this interface. The app wires a sealed,
 * persisted store later. The engine never stores anything itself.
 *
 * exerciseId is any answer scope: an exercise id, a repeat scope such as
 * "e05~r", or a screen scope such as "checkin:3".
 */
export interface AnswerStore {
  get(exerciseId: string, fieldId: string): FieldValue | undefined;
  set(exerciseId: string, fieldId: string, value: FieldValue): void;
}

/** Starting value for a field, before the reader has touched it. */
export function defaultValue(field: Field): FieldValue {
  switch (field.type) {
    case "short_text":
    case "long_text":
    case "time_of_day":
      return "";
    case "scale_0_10":
      return null;
    case "yes_no":
      return null;
    case "checklist":
      return (field.options ?? []).map(() => false);
    case "ranked_list":
      return Array.from({ length: field.max_items ?? 3 }, () => "");
    case "two_column":
      return [
        ["", ""],
        ["", ""],
      ];
    case "rating_grid":
      return (field.rows ?? []).map(() => null);
    case "weekly_grid":
      return field.rows
        ? Array.from({ length: 7 }, () => (field.rows ?? []).map(() => null))
        : Array.from({ length: 7 }, () => false);
    case "number":
    case "currency":
      return null;
    case "table":
      return defaultTable(field);
    case "decision_matrix":
      return defaultMatrix(field);
    default:
      return null;
  }
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const isNumOrNull = (x: unknown) => typeof x === "number" || x === null;

/**
 * Bring a stored value into the shape a field expects. Anything that does not
 * fit falls back to the default. Shapes can drift when content is edited after
 * answers were saved, so the renderer never trusts a stored value blindly.
 */
export function coerceValue(field: Field, stored: FieldValue | undefined): FieldValue {
  const fallback = defaultValue(field);
  if (stored === undefined) return fallback;
  switch (field.type) {
    case "short_text":
    case "long_text":
    case "time_of_day":
      return typeof stored === "string" ? stored : fallback;
    case "scale_0_10":
      return typeof stored === "number" || stored === null ? stored : fallback;
    case "yes_no":
      return stored === "yes" || stored === "no" || stored === null ? stored : fallback;
    case "checklist": {
      if (!Array.isArray(stored) || !stored.every((x) => typeof x === "boolean")) return fallback;
      const base = fallback as boolean[];
      return base.map((_, i) => (stored as boolean[])[i] ?? false);
    }
    case "ranked_list": {
      if (!isStringArray(stored)) return fallback;
      const base = fallback as string[];
      return base.map((_, i) => stored[i] ?? "");
    }
    case "two_column": {
      if (!Array.isArray(stored) || !stored.every(isStringArray)) return fallback;
      const rows = stored as string[][];
      return rows.length ? rows.map((r) => [r[0] ?? "", r[1] ?? ""]) : fallback;
    }
    case "rating_grid": {
      if (!Array.isArray(stored) || !stored.every(isNumOrNull)) return fallback;
      const base = fallback as (number | null)[];
      return base.map((_, i) => (stored as (number | null)[])[i] ?? null);
    }
    case "weekly_grid": {
      if (!Array.isArray(stored)) return fallback;
      if (field.rows) {
        if (!stored.every((d) => Array.isArray(d) && d.every(isNumOrNull))) return fallback;
        const days = stored as (number | null)[][];
        const rows = field.rows;
        return Array.from({ length: 7 }, (_, d) => rows.map((_, r) => days[d]?.[r] ?? null));
      }
      if (!stored.every((x) => typeof x === "boolean")) return fallback;
      return Array.from({ length: 7 }, (_, d) => (stored as boolean[])[d] ?? false);
    }
    case "number":
    case "currency":
      return typeof stored === "number" && Number.isFinite(stored) ? stored : null;
    case "table":
      return coerceTable(field, stored);
    case "decision_matrix":
      return coerceMatrix(field, stored);
    default:
      return null;
  }
}

/**
 * Whether a field counts as answered. Lifted from the legacy filled(): an
 * optional field always passes, a rating grid needs every row, text needs a
 * non-blank value, lists need at least one entry.
 */
export function isAnswered(field: Field, stored: FieldValue | undefined): boolean {
  if (field.optional) return true;
  const v = coerceValue(field, stored);
  switch (field.type) {
    case "rating_grid":
      return (v as RatingGridValue).every((x) => x !== null);
    case "short_text":
    case "long_text":
    case "time_of_day":
      return (v as string).trim().length > 0;
    case "scale_0_10":
      return v !== null;
    case "yes_no":
      return v !== null;
    case "checklist":
      return (v as boolean[]).some(Boolean);
    case "ranked_list":
      return (v as string[]).some((x) => x.trim().length > 0);
    case "two_column":
      return (v as string[][]).some((r) => r.some((x) => x.trim().length > 0));
    case "weekly_grid":
      if (field.rows) return (v as (number | null)[][]).some((d) => d.some((x) => x !== null));
      return (v as boolean[]).some(Boolean);
    case "number":
    case "currency":
      return v !== null;
    case "table":
      return tableAnswered(field, v as TableValue);
    case "decision_matrix":
      return matrixAnswered(field, v as DecisionMatrixValue);
    default:
      return true;
  }
}

/** The one option list the content uses as a stand-in for the Toolkit. */
export const TOOLKIT_OPTIONS_MARKER = "From your Toolkit";

/** Resolve a checklist's options, swapping the Toolkit marker for tool titles. */
export function resolveField(field: Field, toolkitTitles: readonly string[]): Field {
  if (field.type === "checklist" && field.options?.[0] === TOOLKIT_OPTIONS_MARKER) {
    return { ...field, options: [...toolkitTitles] };
  }
  return field;
}
