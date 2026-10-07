"use client";

import type { Field } from "@akana/schema";
import {
  Checklist,
  CurrencyField,
  DecisionMatrix,
  LongText,
  NumberField,
  PendingField,
  RankedList,
  RatingGrid,
  Scale010,
  ShortText,
  Table,
  TimeOfDay,
  TwoColumn,
  WeeklyGrid,
  YesNo,
} from "./fields";
import {
  coerceValue,
  isPendingFieldType,
  UnknownFieldError,
  type ChecklistValue,
  type DecisionMatrixValue,
  type FieldValue,
  type NumberValue,
  type RankedListValue,
  type RatingGridValue,
  type ScaleValue,
  type TableValue,
  type TextValue,
  type TwoColumnValue,
  type WeeklyGridValue,
  type YesNoValue,
} from "./types";

export interface FieldRendererProps {
  field: Field;
  /** The stored value, or undefined when the reader has not answered yet. */
  value: FieldValue | undefined;
  onChange: (value: FieldValue) => void;
  readOnly?: boolean;
  /** Prefix for control ids so the same field can appear twice on one page. */
  idPrefix?: string;
}

/**
 * Picks the component for a field type. A type listed in
 * PENDING_FIELD_TYPES (none since F-113) gets the labelled placeholder.
 * Anything else throws UnknownFieldError so the harness and the
 * validator can catch content the engine cannot show.
 */
export function FieldRenderer({ field, value, onChange, readOnly, idPrefix }: FieldRendererProps) {
  const controlId = idPrefix ? `${idPrefix}-${field.id}` : field.id;
  const v = coerceValue(field, value);
  const common = { readOnly, controlId };
  switch (field.type) {
    case "short_text":
      return <ShortText field={{ ...field, type: "short_text" }} value={v as TextValue} onChange={onChange} {...common} />;
    case "long_text":
      return <LongText field={{ ...field, type: "long_text" }} value={v as TextValue} onChange={onChange} {...common} />;
    case "time_of_day":
      return <TimeOfDay field={{ ...field, type: "time_of_day" }} value={v as TextValue} onChange={onChange} {...common} />;
    case "scale_0_10":
      return <Scale010 field={{ ...field, type: "scale_0_10" }} value={v as ScaleValue} onChange={onChange} {...common} />;
    case "yes_no":
      return <YesNo field={{ ...field, type: "yes_no" }} value={v as YesNoValue} onChange={onChange} {...common} />;
    case "checklist":
      return <Checklist field={{ ...field, type: "checklist" }} value={v as ChecklistValue} onChange={onChange} {...common} />;
    case "ranked_list":
      return <RankedList field={{ ...field, type: "ranked_list" }} value={v as RankedListValue} onChange={onChange} {...common} />;
    case "two_column":
      return <TwoColumn field={{ ...field, type: "two_column" }} value={v as TwoColumnValue} onChange={onChange} {...common} />;
    case "rating_grid":
      return <RatingGrid field={{ ...field, type: "rating_grid" }} value={v as RatingGridValue} onChange={onChange} {...common} />;
    case "weekly_grid":
      return <WeeklyGrid field={{ ...field, type: "weekly_grid" }} value={v as WeeklyGridValue} onChange={onChange} {...common} />;
    case "number":
      return <NumberField field={{ ...field, type: "number" }} value={v as NumberValue} onChange={onChange} {...common} />;
    case "currency":
      return <CurrencyField field={{ ...field, type: "currency" }} value={v as NumberValue} onChange={onChange} {...common} />;
    case "table":
      return <Table field={{ ...field, type: "table" }} value={v as TableValue} onChange={onChange} {...common} />;
    case "decision_matrix":
      return <DecisionMatrix field={{ ...field, type: "decision_matrix" }} value={v as DecisionMatrixValue} onChange={onChange} {...common} />;
    default:
      if (isPendingFieldType(field.type)) return <PendingField field={field} />;
      throw new UnknownFieldError(field.id, field.type);
  }
}
