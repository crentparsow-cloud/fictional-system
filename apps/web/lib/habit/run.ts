/**
 * The optional daily run, shown in the app as a streak (build list 4.4,
 * 13.6). Pure functions: the server hands in finished steps per local day
 * and gets back a quiet summary.
 *
 * Rules, all from the Phase B decisions:
 *   - it counts finished steps, never time spent or opens
 *   - a day is a goal day when the reader finished at least their daily goal
 *   - a gap of up to `pauseDays` days with no goal day is an automatic free
 *     pause. It neither adds to the run nor ends it. The reader does nothing
 *   - a longer gap ends the run quietly. The longest run is kept
 *   - there is no comparison with anyone, no count of missed days and no
 *     number the reader is asked to protect
 *
 * The data layer decides which steps reach this (tier 'none' titles only,
 * and only after the reader switched the run on; migration 0049). Nothing
 * here knows about titles.
 */

export const DEFAULT_PAUSE_DAYS = 3;
export const DEFAULT_OFFER_AFTER_STEPS = 3;
export const DEFAULT_MAX_GOAL = 3;

export interface StepDay {
  /** Local date, YYYY-MM-DD. */
  day: string;
  /** Steps finished for the first time on that day. */
  steps: number;
}

export interface RunSummary {
  /** Goal days in the current run, pauses not counted. 0 when there is no run. */
  current: number;
  /** The longest run so far. */
  longest: number;
  /** Steps finished today. */
  todaySteps: number;
  /** The daily goal, echoed. */
  goal: number;
  goalMetToday: boolean;
  /** The run is alive but today's goal is not met yet, or a pause is under way. */
  resting: boolean;
}

const DAY_MS = 86_400_000;

/** Whole days from a to b (YYYY-MM-DD), a before b gives a positive number. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

export function summariseRun(days: readonly StepDay[], today: string, goal: number, pauseDays: number = DEFAULT_PAUSE_DAYS): RunSummary {
  const g = Math.max(1, Math.floor(goal) || 1);
  const pause = Math.max(0, Math.floor(pauseDays));
  const goalDays = [...new Set(days.filter((d) => d.steps >= g && d.day <= today).map((d) => d.day))].sort();
  const todaySteps = days.filter((d) => d.day === today).reduce((n, d) => n + d.steps, 0);
  const goalMetToday = todaySteps >= g;

  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of goalDays) {
    // The gap is the days between two goal days with none in them.
    if (prev !== null && daysBetween(prev, day) - 1 <= pause) run += 1;
    else run = 1;
    if (run > longest) longest = run;
    prev = day;
  }

  const last = goalDays[goalDays.length - 1];
  const alive = last !== undefined && daysBetween(last, today) - 1 <= pause;
  const current = alive ? run : 0;
  return { current, longest, todaySteps, goal: g, goalMetToday, resting: current > 0 && !goalMetToday };
}

export interface OfferInput {
  /** Finished steps on titles where the run can apply (the database count). */
  eligibleSteps: number;
  offerAfter: number;
  runOn: boolean;
  declined: boolean;
}

/** The run is offered once, after enough finished steps, and never again after "not now". */
export function shouldOfferRun(i: OfferInput): boolean {
  return !i.runOn && !i.declined && i.eligibleSteps >= i.offerAfter;
}

/** The quiet line under the numbers. No pressure, no count of days away. */
export function runLine(s: RunSummary): string {
  if (s.current === 0 && s.longest === 0) return "Your first goal day starts with one finished step.";
  if (s.current === 0) return "A new run starts with your next finished step.";
  if (s.goalMetToday) return "Today's goal is done.";
  return s.goal === 1 ? "One finished step makes today a goal day." : `${s.goal} finished steps make today a goal day.`;
}
