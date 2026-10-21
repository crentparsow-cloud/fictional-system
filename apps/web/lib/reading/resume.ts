/**
 * The resume card (3.7): "Continue" opens the exact field the reader was in.
 * The place is ids only, kept by reading_places (0040). The link uses the
 * same query the read page already checks, so nothing new is trusted.
 */

export interface PlaceRow {
  unit: number;
  exercise_id: string | null;
  page: string | null;
  field_id: string | null;
  mode: string | null;
}

export const LEAVE_LINE = "You can leave any time. Your answers are kept.";

/** /read/<slug>?unit=&step=&page=&field=, or the plain unit when no exercise was open. */
export function resumeHref(slug: string, row: PlaceRow): string {
  const q = new URLSearchParams({ unit: String(row.unit) });
  if (row.exercise_id) {
    q.set("step", row.exercise_id);
    if (row.mode === "short") q.set("short", "1");
    if (row.page) q.set("page", row.page);
    if (row.field_id) q.set("field", row.field_id);
  }
  return `/read/${encodeURIComponent(slug)}?${q.toString()}`;
}

type Unit = "week" | "day" | "module" | "chapter" | "unit";
const CAP: Record<Unit, string> = { week: "Week", day: "Day", module: "Module", chapter: "Chapter", unit: "Unit" };

/** "Week 3" or "Week 3, in the middle of a step". No dates, no counts of time away. */
export function resumeWhere(word: Unit, row: PlaceRow): string {
  const name = `${CAP[word]} ${row.unit}`;
  return row.exercise_id ? `${name}, where you left off` : name;
}
