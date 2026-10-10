/**
 * The first week's unit plan for the day-zero email (14.20), as pure
 * functions. Unit names only: the unit's focus line from the public outline,
 * plus the names of the steps in the first unit. Never the workbook or book
 * title, which no email names (F-098). A line that happens to contain one is
 * dropped, whatever put it there.
 *
 * What counts as the first week:
 *   day-by-day workbooks   units 1 to 7
 *   anything else          unit 1 and the names of its steps
 *
 * Wellbeing titles (safety tier standard or higher) give no plan. A unit
 * name on a mental health workbook can say a good deal about the reader, and
 * an email is a poor place to keep that. The email falls back to the dates.
 */

export type UnitKind = "week" | "day" | "module" | "chapter";

export interface OutlineEntry {
  number: number;
  focus: string;
}

export interface FirstWeekPlan {
  heading: string;
  items: string[];
}

const MAX_ITEMS = 8;
const MAX_LINE = 120;

function unitLabel(kind: UnitKind): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function clean(text: string): string {
  return text.replace(/\s+/g, " ").replace(/[–—]/g, "-").trim().slice(0, MAX_LINE);
}

export function firstWeekPlan(input: {
  unit: UnitKind;
  outline: readonly OutlineEntry[];
  /** Names of the steps in unit 1, in order. */
  stepTitles?: readonly string[];
  /** Titles the email must never carry: the workbook's, its short title and its book's. */
  forbidden?: readonly string[];
  /** The workbook's safety tier. Anything but "none" gives no plan. */
  safetyTier?: "none" | "standard" | "higher";
}): FirstWeekPlan | null {
  if (input.safetyTier && input.safetyTier !== "none") return null;
  const label = unitLabel(input.unit);
  const wanted = input.unit === "day" ? 7 : 1;
  const entries = [...input.outline]
    .filter((o) => Number.isInteger(o.number) && o.number >= 1 && o.number <= wanted && o.focus?.trim())
    .sort((a, b) => a.number - b.number);

  const lines: string[] = entries.map((o) => `${label} ${o.number}: ${clean(o.focus)}`);
  if (input.unit !== "day") {
    for (const title of input.stepTitles ?? []) if (title.trim()) lines.push(`Step: ${clean(title)}`);
  }

  const banned = (input.forbidden ?? []).map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 3);
  const items = lines.filter((l) => !banned.some((b) => l.toLowerCase().includes(b))).slice(0, MAX_ITEMS);
  if (!items.length) return null;
  return { heading: "Your first week", items };
}
