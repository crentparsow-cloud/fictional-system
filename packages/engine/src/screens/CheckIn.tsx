"use client";

import type { WorkbookV3 } from "@akana/schema";
import { useState } from "react";
import { FieldRenderer } from "../FieldRenderer";
import { checkinScope } from "../store";
import { isAnswered, resolveField, type AnswerStore } from "../types";
import { Eyebrow } from "./parts";

export type CheckIn = NonNullable<WorkbookV3["checkin"]>;

export interface CheckInScreenProps {
  checkin: CheckIn;
  unitNumber: number;
  unitLabel: string;
  store: AnswerStore;
  toolkitTitles?: readonly string[];
  /** Controlled short mode. Leave undefined to let the screen hold it. */
  short?: boolean;
  onShortChange?: (short: boolean) => void;
  onSave?: () => void;
  readOnly?: boolean;
}

/**
 * The weekly check-in: the full set of fields, or the two short ones on a
 * hard week. Save is enabled once every required text or scale field has an
 * answer. Checklists and weekly grids never block it, as in the legacy app.
 */
export function CheckInScreen({ checkin, unitNumber, unitLabel, store, toolkitTitles = [], short: shortProp, onShortChange, onSave, readOnly }: CheckInScreenProps) {
  const [shortState, setShortState] = useState(false);
  const short = shortProp ?? shortState;
  const setShort = (s: boolean) => {
    setShortState(s);
    onShortChange?.(s);
  };
  const scope = checkinScope(unitNumber);
  const fields = (short ? checkin.fields.filter((f) => checkin.short_field_ids.includes(f.id)) : checkin.fields).map((f) =>
    resolveField(f, toolkitTitles),
  );
  const ready = fields
    .filter((f) => f.type !== "checklist" && f.type !== "weekly_grid")
    .every((f) => isAnswered(f, store.get(scope, f.id)));

  return (
    <section className="ak-screen ak-checkin" data-short={short}>
      <header>
        <Eyebrow>{unitLabel}</Eyebrow>
        <h2 className="ak-h2">Check-in</h2>
      </header>
      <div className="ak-seg" role="group" aria-label="Check-in length">
        <button type="button" aria-pressed={!short} onClick={() => setShort(false)}>
          Full
        </button>
        <button type="button" aria-pressed={short} onClick={() => setShort(true)}>
          Hard week, two questions
        </button>
      </div>
      {fields.map((f) => (
        <FieldRenderer
          key={f.id}
          field={f}
          idPrefix={`checkin-${unitNumber}`}
          value={store.get(scope, f.id)}
          readOnly={readOnly}
          onChange={(v) => store.set(scope, f.id, v)}
        />
      ))}
      {onSave ? (
        <button type="button" className="ak-btn" disabled={!ready || readOnly} onClick={onSave}>
          Save check-in
        </button>
      ) : null}
    </section>
  );
}
