/**
 * The unit map (3.3): the whole programme as one vertical path. Every unit is
 * in one of three states.
 *
 *   done    every exercise in it is finished. Tap it to go back.
 *   today   the first unit with something left to do. It carries Start.
 *   locked  not open: either the purchase does not cover it ("paywall"), or
 *           it comes after today's unit ("ahead"). Locked ahead units open
 *           once the one before them is finished.
 *
 * Pure, so the same function serves the reader's workbook page and the small
 * strip on Today, and the same tests cover both. Nothing here counts days,
 * and nothing is said about a unit being late.
 */

export type PathState = "done" | "today" | "locked";
export type LockReason = "paywall" | "ahead";

export interface PathUnitInput {
  number: number;
  focus: string;
  exerciseIds: readonly string[];
}

export interface PathNode {
  number: number;
  focus: string;
  state: PathState;
  /** Only on a locked unit. */
  reason?: LockReason;
  stepsDone: number;
  stepsTotal: number;
  /** The exercise Start opens: the first one not finished. Only on the today unit. */
  startExerciseId?: string;
}

export interface PathInput {
  units: readonly PathUnitInput[];
  /** Exercise ids finished, as the progress events give them. A repeat (`id~r`) is ignored. */
  done: ReadonlySet<string>;
  /** Units the purchase does not cover. */
  lockedUnits?: readonly number[];
}

export function unitIsDone(u: PathUnitInput, done: ReadonlySet<string>): boolean {
  return u.exerciseIds.length > 0 && u.exerciseIds.every((id) => done.has(id));
}

export function buildPath(input: PathInput): PathNode[] {
  const units = [...input.units].sort((a, b) => a.number - b.number);
  const locked = new Set(input.lockedUnits ?? []);
  let todayAt = -1;
  for (let i = 0; i < units.length; i++) {
    if (!unitIsDone(units[i]!, input.done)) {
      todayAt = i;
      break;
    }
  }
  return units.map((u, i) => {
    const stepsDone = u.exerciseIds.filter((id) => input.done.has(id)).length;
    const base = { number: u.number, focus: u.focus, stepsDone, stepsTotal: u.exerciseIds.length };
    if (unitIsDone(u, input.done)) return { ...base, state: "done" as const };
    if (locked.has(u.number)) return { ...base, state: "locked" as const, reason: "paywall" as const };
    if (i === todayAt) {
      const start = u.exerciseIds.find((id) => !input.done.has(id));
      return { ...base, state: "today" as const, ...(start ? { startExerciseId: start } : {}) };
    }
    return { ...base, state: "locked" as const, reason: "ahead" as const };
  });
}

export interface PathChange {
  /** Units that were not done and now are. */
  closed: number[];
  /** The unit that is now today, when it changed. */
  movedTo: number | null;
}

/** What changed between two paths: the input to the short celebration. */
export function pathChange(prev: readonly PathNode[], next: readonly PathNode[]): PathChange {
  const was = new Map(prev.map((n) => [n.number, n.state]));
  const closed = next.filter((n) => n.state === "done" && was.has(n.number) && was.get(n.number) !== "done").map((n) => n.number);
  const nowToday = next.find((n) => n.state === "today")?.number ?? null;
  const wasToday = prev.find((n) => n.state === "today")?.number ?? null;
  return { closed, movedTo: nowToday !== wasToday ? nowToday : null };
}

export type UnitWord = "week" | "day" | "module" | "chapter" | "part" | "unit";
const CAP: Record<UnitWord, string> = { week: "Week", day: "Day", module: "Module", chapter: "Chapter", part: "Part", unit: "Unit" };
export const unitName = (word: UnitWord, n: number) => `${CAP[word]} ${n}`;

export interface Celebration {
  /** The unit that closed. */
  unit: number;
  line: string;
  /** One burst of confetti. Never on a wellbeing title, and never with reduced motion (the component checks that). */
  confetti: boolean;
}

/**
 * The one moment when a unit closes. A wellbeing title (tier standard or
 * higher) gets the line and no confetti: the page stays quiet. When several
 * units close at once, only the last is celebrated.
 */
export function celebrationFor(change: PathChange, opts: { word: UnitWord; total: number; tier: "none" | "standard" | "higher" }): Celebration | null {
  const unit = change.closed.at(-1);
  if (unit === undefined) return null;
  const last = unit === opts.total;
  const name = unitName(opts.word, unit);
  return {
    unit,
    line: last ? `You have finished the last ${opts.word}. Well done.` : `${name} is complete.`,
    confetti: opts.tier === "none",
  };
}
