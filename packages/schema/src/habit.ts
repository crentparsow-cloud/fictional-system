/**
 * Where streaks and daily goals may appear (decided by Crent, 30 October
 * 2026). The rule is by shelf, not by safety tier: streaks are offered, opt
 * in, on every workbook except those on the Mind and Mood shelf, which never
 * count, never offer and never show streak or goal language. The higher
 * safety tier is also kept out, as belt and braces.
 *
 * The database holds the same rule in app.habit_allowed(workbook_id)
 * (migration 0069). Keep the two in step.
 */

/** The shelves registry id (content/registry/shelves.json) of the Mind and Mood shelf. */
export const MIND_AND_MOOD_SHELF_ID = "mind-and-mood";

export interface HabitFacts {
  safetyTier: "none" | "standard" | "higher";
  /** The workbook's shelf, through its Theme. null when the workbook has no Theme. */
  shelfId: string | null;
}

/** True when streaks, daily goals and the streak offer may reach this workbook. */
export function habitAllowed(w: HabitFacts): boolean {
  return w.shelfId !== MIND_AND_MOOD_SHELF_ID && w.safetyTier !== "higher";
}
