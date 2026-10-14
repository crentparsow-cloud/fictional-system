import type { WorkbookV3 } from "@akana/schema";
import { isAnswered, resolveField, type AnswerStore } from "@akana/engine";

/**
 * The calm estimate (3.6): "About 8 minutes left in this unit". Worked out
 * from the words still to read and the fields still to fill, never from a
 * clock, so it only ever moves when the reader does something. It is a
 * sentence, not a countdown: it is rounded, it never ticks, and it never
 * says anything about being behind.
 */

/** A comfortable reading pace, in words a minute. */
export const WORDS_PER_MINUTE = 200;

/** Seconds to fill one field, by type. Anything not listed counts as a short answer. */
const FIELD_SECONDS: Record<string, number> = {
  short_text: 40,
  long_text: 120,
  time_of_day: 10,
  scale_0_10: 10,
  yes_no: 8,
  checklist: 30,
  ranked_list: 90,
  two_column: 120,
  weekly_grid: 90,
  rating_grid: 60,
  number: 15,
  currency: 15,
  table: 120,
  decision_matrix: 150,
};
const DEFAULT_FIELD_SECONDS = 40;

export interface EstimateField {
  type: string;
  answered: boolean;
  optional?: boolean;
}

export interface EstimateExercise {
  /** Words the reader still has to read in this exercise. Zero once it is done. */
  words: number;
  done: boolean;
  fields: EstimateField[];
}

export interface EstimateInput {
  /** The unit's own reading: introduction, key ideas, takeaway. */
  unitWords: number;
  exercises: EstimateExercise[];
}

export function wordCount(text: string | undefined | null): number {
  if (!text) return 0;
  const m = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}

export interface Estimate {
  /** Whole minutes, rounded. Zero means there is nothing left to do. */
  minutes: number;
  wordsLeft: number;
  fieldsLeft: number;
}

export function estimateUnit(input: EstimateInput, wpm = WORDS_PER_MINUTE): Estimate {
  const open = input.exercises.filter((e) => !e.done);
  // Once every exercise is done there is only the closing reading, which is not worth a number.
  if (input.exercises.length > 0 && open.length === 0) return { minutes: 0, wordsLeft: 0, fieldsLeft: 0 };
  let words = input.unitWords;
  let seconds = 0;
  let fieldsLeft = 0;
  for (const e of open) {
    words += e.words;
    for (const f of e.fields) {
      if (f.answered) continue;
      // An optional field is offered, not owed: it adds nothing to the estimate.
      if (f.optional) continue;
      fieldsLeft += 1;
      seconds += FIELD_SECONDS[f.type] ?? DEFAULT_FIELD_SECONDS;
    }
  }
  const total = (words / wpm) * 60 + seconds;
  return { minutes: Math.max(0, Math.round(total / 60)), wordsLeft: words, fieldsLeft };
}

/**
 * Round to a figure that reads as a guess: single minutes up to ten, then
 * fives, then quarter hours. The wording never promises a precise time.
 */
export function roundMinutes(m: number): number {
  if (m <= 10) return m;
  if (m <= 45) return Math.round(m / 5) * 5;
  return Math.round(m / 15) * 15;
}

/** The line shown at the top of a unit. Null when there is nothing to say. */
export function estimateLine(e: Estimate): string | null {
  if (e.minutes <= 0 && e.wordsLeft === 0 && e.fieldsLeft === 0) return null;
  const m = roundMinutes(e.minutes);
  if (m <= 0) return "Less than a minute left in this unit";
  if (m === 1) return "About a minute left in this unit";
  if (m < 60) return `About ${m} minutes left in this unit`;
  if (m === 60) return "About an hour left in this unit";
  const h = Math.floor(m / 60);
  const rest = m % 60;
  const hours = h === 1 ? "an hour" : `${h} hours`;
  return rest === 0 ? `About ${hours} left in this unit` : rest === 30 ? `About ${hours} and a half left in this unit` : `More than ${hours} left in this unit`;
}

type Doc = Pick<WorkbookV3, "units" | "exercises" | "toolkit">;

function exerciseWords(e: WorkbookV3["exercises"][number]): number {
  let n = wordCount(e.purpose) + wordCount(e.why) + wordCount(e.done_when) + wordCount(e.example?.text);
  for (const s of e.steps) n += wordCount(s.text);
  return n;
}

function unitReadingWords(u: WorkbookV3["units"][number]): number {
  let n = wordCount(u.intro) + wordCount(u.takeaway);
  for (const i of u.ideas ?? []) n += wordCount(i.heading) + wordCount(i.body) + wordCount(i.example);
  return n;
}

/**
 * Builds the input for one unit from the workbook, the done exercises and
 * the reader's answers. It reads whether a field has an answer, never what
 * the answer says.
 */
export function estimateInputFor(doc: Doc, unitNumber: number, done: ReadonlySet<string>, store: AnswerStore): EstimateInput | null {
  const unit = doc.units.find((u) => u.number === unitNumber);
  if (!unit) return null;
  const byId = new Map(doc.exercises.map((e) => [e.id, e]));
  const titles = doc.toolkit.map((t) => t.title);
  const exercises: EstimateExercise[] = [];
  for (const id of unit.exercise_ids) {
    const e = byId.get(id);
    if (!e) continue;
    const isDone = done.has(id);
    exercises.push({
      done: isDone,
      words: isDone ? 0 : exerciseWords(e),
      fields: e.fields.map((f) => {
        const rf = resolveField(f, titles);
        return { type: f.type, optional: f.optional === true, answered: isAnswered(rf, store.get(id, f.id)) };
      }),
    });
  }
  return { unitWords: unitReadingWords(unit), exercises };
}

/** The finished line for a unit, or null when there is no unit or nothing left. */
export function unitEstimateLine(doc: Doc, unitNumber: number, done: ReadonlySet<string>, store: AnswerStore): string | null {
  const input = estimateInputFor(doc, unitNumber, done, store);
  if (!input) return null;
  return estimateLine(estimateUnit(input));
}
