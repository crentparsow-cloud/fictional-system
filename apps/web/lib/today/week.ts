import { countWord, stepFilled, type ProgrammeStep } from "@/lib/today/steps";

/**
 * The weekly rhythm (4.2): "Week 3 of 8. Two steps this week." and a mark for
 * a calendar week in which a step was finished with its fields filled
 * (Khan Academy's rule). It is a mark for one week, never a run of weeks, and
 * nothing here counts days. There is no streak, no longest run and no total
 * of weeks.
 */

export type UnitWord = "week" | "day" | "module" | "chapter" | "unit";

/** ISO week key such as "2026-W41", for the reader's own time zone. Weeks start on Monday. */
export function weekKey(at: Date, timeZone = "Europe/London"): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const d = new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
  const dow = d.getUTCDay() || 7; // Monday 1 to Sunday 7
  d.setUTCDate(d.getUTCDate() + 4 - dow); // the Thursday of this ISO week
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export interface StepEvent {
  kind: string;
  ref: string | null;
  at: string;
}

/**
 * Step finishes that count: a step_done event for a plain exercise id whose
 * fields are filled. A repeat, a check-in or a toolkit use does not count.
 */
export function countedFinishes(
  steps: readonly ProgrammeStep[],
  events: readonly StepEvent[],
  has: (exerciseId: string, fieldId: string) => boolean,
): { exerciseId: string; at: Date }[] {
  const byId = new Map(steps.map((s) => [s.exerciseId, s]));
  const out: { exerciseId: string; at: Date }[] = [];
  for (const e of events) {
    if (e.kind !== "step_done" || !e.ref || e.ref.endsWith("~r")) continue;
    const step = byId.get(e.ref);
    if (!step || !stepFilled(step, has)) continue;
    const at = new Date(e.at);
    if (!Number.isNaN(at.getTime())) out.push({ exerciseId: e.ref, at });
  }
  return out;
}

/** The calendar weeks that carry a mark. */
export function weekMarks(finishes: readonly { at: Date }[], timeZone?: string): Set<string> {
  return new Set(finishes.map((f) => weekKey(f.at, timeZone)));
}

/** True when this calendar week has a mark. The only thing the screens show about marks. */
export function thisWeekMarked(finishes: readonly { at: Date }[], now: Date, timeZone?: string): boolean {
  return weekMarks(finishes, timeZone).has(weekKey(now, timeZone));
}

const LABEL: Record<UnitWord, string> = { week: "Week", day: "Day", module: "Module", chapter: "Chapter", unit: "Unit" };
export const unitWordLabel = (u: UnitWord) => LABEL[u];

export interface RhythmInput {
  unitWord: UnitWord;
  /** The unit the reader is on: the unit of their next step, or the last unit when every step is done. */
  unit: number;
  /** Units in the programme, when known. */
  unitCount: number | null;
  stepsInUnit: number;
}

/** "Week 3 of 8. Two steps this week." The second sentence follows the unit word. */
export function rhythmLine(i: RhythmInput): string {
  const head = i.unitCount && i.unitCount >= i.unit ? `${LABEL[i.unitWord]} ${i.unit} of ${i.unitCount}.` : `${LABEL[i.unitWord]} ${i.unit}.`;
  if (i.stepsInUnit <= 0) return head;
  const n = countWord(i.stepsInUnit);
  const noun = i.stepsInUnit === 1 ? "step" : "steps";
  const where = i.unitWord === "week" ? "this week" : i.unitWord === "day" ? "today" : `in this ${i.unitWord}`;
  return `${head} ${n.charAt(0).toUpperCase() + n.slice(1)} ${noun} ${where}.`;
}

/** The unit the rhythm line talks about, from the steps and what is done. */
export function rhythmUnit(steps: readonly ProgrammeStep[], next: ProgrammeStep | null): { unit: number; stepsInUnit: number } | null {
  const at = next ?? steps[steps.length - 1] ?? null;
  return at ? { unit: at.unit, stepsInUnit: at.countInUnit } : null;
}
