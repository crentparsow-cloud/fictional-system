import type { WorkbookV3 } from "@akana/schema";
import { fieldKey } from "@/lib/answer-fields";

/**
 * Programme steps for Today, reminders, the calendar feed and the weekly
 * rhythm (build list 4.1, 4.2, 4.7, 4.8). A step is one exercise in
 * programme order. Nothing here reads an answer: it works from the shape of
 * the programme, the progress events (ids and times) and the list of field
 * names that have an answer row. Reader text stays sealed.
 */

export interface StepField {
  id: string;
  type: string;
  label: string;
  optional: boolean;
  sensitive: boolean;
}

export interface ProgrammeStep {
  unit: number;
  /** The unit's focus line: the name used in reminders and the calendar. */
  unitName: string;
  exerciseId: string;
  title: string;
  minutes: number;
  fields: StepField[];
  /** The short version, when the exercise has one. */
  short: { minutes: number; fieldIds: string[] } | null;
  /** Steps in this unit, in order, for "Two steps this week". */
  indexInUnit: number;
  countInUnit: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

function parseField(f: unknown): StepField | null {
  if (!isRecord(f) || typeof f.id !== "string" || typeof f.type !== "string") return null;
  return { id: f.id, type: f.type, label: str(f.label), optional: f.optional === true, sensitive: f.sensitive === true };
}

function parseStep(unit: number, unitName: string, e: unknown): Omit<ProgrammeStep, "indexInUnit" | "countInUnit"> | null {
  if (!isRecord(e) || typeof e.id !== "string") return null;
  const fields = (Array.isArray(e.fields) ? e.fields : []).map(parseField).filter((f): f is StepField => f !== null);
  const sv = isRecord(e.short_version) ? e.short_version : null;
  const short =
    sv && typeof sv.minutes === "number" && Array.isArray(sv.field_ids)
      ? { minutes: sv.minutes, fieldIds: sv.field_ids.filter((x): x is string => typeof x === "string") }
      : null;
  return {
    unit,
    unitName,
    exerciseId: e.id,
    title: str(e.title),
    minutes: typeof e.minutes === "number" && e.minutes > 0 ? e.minutes : 10,
    fields,
    short,
  };
}

function finish(list: Omit<ProgrammeStep, "indexInUnit" | "countInUnit">[]): ProgrammeStep[] {
  const perUnit = new Map<number, number>();
  for (const s of list) perUnit.set(s.unit, (perUnit.get(s.unit) ?? 0) + 1);
  const seen = new Map<number, number>();
  return list.map((s) => {
    const i = seen.get(s.unit) ?? 0;
    seen.set(s.unit, i + 1);
    return { ...s, indexInUnit: i, countInUnit: perUnit.get(s.unit) ?? 1 };
  });
}

/** From the published unit sections (workbook_sections kind "unit", exercises already resolved in each body). */
export function stepsFromUnitSections(sections: readonly { unit_number: number | null; body: unknown }[]): ProgrammeStep[] {
  const out: Omit<ProgrammeStep, "indexInUnit" | "countInUnit">[] = [];
  const units = [...sections].filter((s) => s.unit_number !== null && isRecord(s.body)).sort((a, b) => (a.unit_number ?? 0) - (b.unit_number ?? 0));
  for (const s of units) {
    const body = s.body as Record<string, unknown>;
    const name = str(body.focus);
    for (const e of Array.isArray(body.exercises) ? body.exercises : []) {
      const step = parseStep(s.unit_number as number, name, e);
      if (step) out.push(step);
    }
  }
  return finish(out);
}

/** From a whole workbook document, for the reader page. */
export function stepsFromWorkbook(doc: Pick<WorkbookV3, "units" | "exercises">): ProgrammeStep[] {
  const byId = new Map(doc.exercises.map((e) => [e.id, e]));
  const out: Omit<ProgrammeStep, "indexInUnit" | "countInUnit">[] = [];
  const seen = new Set<string>();
  for (const u of [...doc.units].sort((a, b) => a.number - b.number)) {
    for (const id of u.exercise_ids) {
      const e = byId.get(id);
      if (!e || seen.has(id)) continue;
      seen.add(id);
      const step = parseStep(u.number, u.focus, e);
      if (step) out.push(step);
    }
  }
  return finish(out);
}

/** The refs of step_done events that are plain exercise ids. A repeat ("id~r") is not a new step. */
export function doneExerciseIds(events: readonly { kind: string; ref: string | null }[]): Set<string> {
  const out = new Set<string>();
  for (const e of events) if (e.kind === "step_done" && e.ref && !e.ref.endsWith("~r")) out.add(e.ref);
  return out;
}

/** The next step the reader has not finished, in programme order. */
export function nextStep(steps: readonly ProgrammeStep[], done: ReadonlySet<string>): ProgrammeStep | null {
  return steps.find((s) => !done.has(s.exerciseId)) ?? null;
}

/** Steps still to do, in programme order. */
export function remainingSteps(steps: readonly ProgrammeStep[], done: ReadonlySet<string>): ProgrammeStep[] {
  return steps.filter((s) => !done.has(s.exerciseId));
}

/**
 * True when every required field of the step has an answer row, in the full
 * version or in the short version. The Done button only enables when the
 * fields are answered, so this is the server-side second look: it sees that
 * a row exists, never what it says. `has` is asked for (exerciseId, fieldId).
 */
export function stepFilled(step: ProgrammeStep, has: (exerciseId: string, fieldId: string) => boolean): boolean {
  const full = step.fields.filter((f) => !f.optional).every((f) => has(step.exerciseId, f.id));
  if (full) return true;
  if (step.short) return step.short.fieldIds.length > 0 && step.short.fieldIds.every((id) => has(step.exerciseId, id));
  return false;
}

/** `has` backed by the list of answered field paths ("exercise:plan.what"). */
export function hasFromFieldPaths(paths: ReadonlySet<string>): (exerciseId: string, fieldId: string) => boolean {
  return (exerciseId, fieldId) => paths.has(fieldKey(exerciseId, fieldId));
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
export function countWord(n: number): string {
  return n >= 0 && n < WORDS.length ? (WORDS[n] as string) : String(n);
}
