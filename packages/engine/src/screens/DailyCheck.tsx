"use client";

import type { WorkbookV3 } from "@akana/schema";
import { Chip } from "../fields/common";

export type DailyCheck = NonNullable<WorkbookV3["daily_check"]>;

export interface DailyCheckValue {
  score: number | null;
  /** Indexes into daily_check.tags. */
  tags: number[];
}

export interface DailyCheckScreenProps {
  dailyCheck: DailyCheck;
  value: DailyCheckValue;
  onChange: (value: DailyCheckValue) => void;
  onSave?: () => void;
  readOnly?: boolean;
}

export const emptyDailyCheck = (): DailyCheckValue => ({ score: null, tags: [] });

/**
 * One question, 0 to 10, and what helped. About a minute. A missed day
 * leaves no mark, so this screen never counts days.
 */
export function DailyCheckScreen({ dailyCheck: dc, value, onChange, onSave, readOnly }: DailyCheckScreenProps) {
  const toggleTag = (i: number) => {
    const tags = value.tags.includes(i) ? value.tags.filter((t) => t !== i) : [...value.tags, i];
    onChange({ ...value, tags });
  };
  return (
    <section className="ak-screen ak-daily">
      <header>
        <h2 className="ak-h2" id="ak-daily-q">
          {dc.question}
        </h2>
        <p className="ak-muted ak-small">About a minute. It is optional, and a missed day leaves no mark.</p>
      </header>
      <div className="ak-chips ak-chips-scale" role="group" aria-labelledby="ak-daily-q">
        {Array.from({ length: 11 }, (_, n) => (
          <Chip
            key={n}
            pressed={value.score === n}
            disabled={readOnly}
            label={`${n} out of 10`}
            onPress={() => onChange({ ...value, score: value.score === n ? null : n })}
          >
            {n}
          </Chip>
        ))}
      </div>
      <div className="ak-scale-ends ak-small ak-muted" aria-hidden="true">
        <span>0: {dc.scale_low}</span>
        <span>10: {dc.scale_high}</span>
      </div>
      <span className="ak-q" id="ak-daily-tags">
        What helped today?
      </span>
      <div className="ak-chips" role="group" aria-labelledby="ak-daily-tags">
        {dc.tags.map((t, i) => (
          <Chip key={i} pressed={value.tags.includes(i)} disabled={readOnly} onPress={() => toggleTag(i)}>
            {t}
          </Chip>
        ))}
      </div>
      {onSave ? (
        <button type="button" className="ak-btn" disabled={value.score === null || readOnly} onClick={onSave}>
          Save
        </button>
      ) : null}
    </section>
  );
}
