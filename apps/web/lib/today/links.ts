import type { ProgrammeStep } from "@/lib/today/steps";

/**
 * Links that open the reader at a step (12.10). /today/go is the one to
 * bookmark or put in an email: it finds the step and redirects here.
 */

export const EXERCISE_ID = /^[a-z0-9][a-z0-9_:~.-]{0,79}$/;
export const PAGES = ["purpose", "steps", "example", "yours", "done"] as const;
export type StepPage = (typeof PAGES)[number];

/** /read/<slug>?unit=3&step=<exercise>, with short=1 for the short version. */
export function stepHref(slug: string, step: Pick<ProgrammeStep, "unit" | "exerciseId">, opts: { short?: boolean } = {}): string {
  const q = new URLSearchParams({ unit: String(step.unit), step: step.exerciseId });
  if (opts.short) q.set("short", "1");
  return `/read/${encodeURIComponent(slug)}?${q.toString()}`;
}

/** Resumes a paused place: the read page looks it up. */
export function resumeHref(slug: string): string {
  return `/read/${encodeURIComponent(slug)}?resume=1`;
}

export interface OpenAt {
  unit: number;
  exerciseId: string | null;
  mode: "full" | "short" | null;
  page: StepPage | null;
  fieldId: string | null;
}

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Reads and checks the place from a page's query string. Anything odd is dropped, never trusted. */
export function openAtFromQuery(sp: Raw): OpenAt | null {
  const unit = Number.parseInt(one(sp.unit) ?? "", 10);
  if (!Number.isInteger(unit) || unit < 1 || unit > 999) return null;
  const step = one(sp.step);
  const page = one(sp.page);
  const field = one(sp.field);
  const exerciseId = step && EXERCISE_ID.test(step) ? step : null;
  return {
    unit,
    exerciseId,
    mode: one(sp.short) === "1" ? "short" : exerciseId ? "full" : null,
    page: page && (PAGES as readonly string[]).includes(page) ? (page as StepPage) : null,
    fieldId: field && EXERCISE_ID.test(field) ? field : null,
  };
}

/** The step the easy path points at: the next step, in its short version when it has one. */
export function easyStep(step: ProgrammeStep): { minutes: number; short: boolean } {
  return step.short ? { minutes: step.short.minutes, short: true } : { minutes: step.minutes, short: false };
}
