/**
 * The reader's pace for one workbook (decided by Crent, 30 October 2026).
 * Each enrolment carries a pace the reader chooses: every day, three times a
 * week, once a week, or their own pace. It drives what Today suggests, the
 * wording of the rhythm line and continue cards, when reminders go, and the
 * friend status. It never locks anything: a reader can always open the next
 * part early.
 *
 * Stored in enrolments.pace (migration 0069). null there means the default:
 * weekly for a title whose structure.unit is "week", own pace otherwise.
 *
 * Days are local calendar dates, "YYYY-MM-DD", in the reader's time zone.
 * Weeks start on Monday, as the weekly mark does (lib/today/week.ts).
 */

export const PACES = ["daily", "few_times_a_week", "weekly", "own_pace"] as const;
export type Pace = (typeof PACES)[number];

/** Parts a reader on "few times a week" is offered in one calendar week. */
export const FEW_TIMES_PER_WEEK = 3;
/** Days between gentle reminders, and the quiet spell before one, on own pace. */
export const OWN_PACE_REMINDER_DAYS = 7;

export function isPace(v: unknown): v is Pace {
  return typeof v === "string" && (PACES as readonly string[]).includes(v);
}

/** The default for a title: weekly when its units are weeks, own pace otherwise. */
export function defaultPace(unit: string | null | undefined): Pace {
  return unit === "week" ? "weekly" : "own_pace";
}

/** The pace in force: the reader's choice, or the default for the title. */
export function effectivePace(stored: unknown, unit: string | null | undefined): Pace {
  return isPace(stored) ? stored : defaultPace(unit);
}

/** The choice as the reader sees it on the start screen, the reading screen and /you/habit. */
export const PACE_LABELS: Record<Pace, string> = {
  daily: "Every day",
  few_times_a_week: "Three times a week",
  weekly: "Once a week",
  own_pace: "At my own pace",
};

/** One plain line under the choice. Nothing here counts days or misses. */
export const PACE_HINTS: Record<Pace, string> = {
  daily: "A short part each day. Reminders, if you have them on, can come any day you choose.",
  few_times_a_week: "Three parts a week, with a day or so between them.",
  weekly: "One part a week. Reminders, if you have them on, wait until the next week.",
  own_pace: "No schedule. If reminders are on, at most one gentle note a week.",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One pace change, checked: an enrolment id and a known pace, or null. */
export function paceChange(enrolmentId: unknown, pace: unknown): { enrolmentId: string; pace: Pace } | null {
  return typeof enrolmentId === "string" && UUID.test(enrolmentId) && isPace(pace) ? { enrolmentId, pace } : null;
}

/** The pace fields of the /you/habit form, named "pace:<enrolment id>". Unknown values are left out. */
export function parsePaceForm(data: { entries(): IterableIterator<[string, FormDataEntryValue]> }): { enrolmentId: string; pace: Pace }[] {
  const out: { enrolmentId: string; pace: Pace }[] = [];
  for (const [name, value] of data.entries()) {
    if (!name.startsWith("pace:")) continue;
    const c = paceChange(name.slice(5), value);
    if (c) out.push(c);
  }
  return out.slice(0, 50);
}

const DAY_MS = 86_400_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function toUtc(day: string): number {
  if (!ISO_DAY.test(day)) throw new Error(`not a date: ${day}`);
  return Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  return fromUtc(toUtc(day) + n * DAY_MS);
}

/** Whole days from a to b. Positive when b is later. */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

/** The Monday of the calendar week holding this day. */
export function weekStart(day: string): string {
  const dow = new Date(toUtc(day)).getUTCDay() || 7; // Monday 1 to Sunday 7
  return addDays(day, 1 - dow);
}

export interface PaceInput {
  pace: Pace;
  /** The local day the reader last finished a step on this workbook, or null before the first. */
  lastFinishedDay: string | null;
  /** Steps finished on this workbook in the calendar week of lastFinishedDay. Only "few times a week" reads it. */
  finishedInThatWeek?: number;
}

/**
 * The next local day the pace suggests a part, from the pace and the last
 * finished day. null for own pace, which never has a due day. Before the
 * first finished step every pace but own pace is due straight away, so the
 * caller passes today and gets today back.
 *
 *   daily             the day after the last finish
 *   few_times_a_week  two days after the last finish, or the next Monday
 *                     once three are done that week
 *   weekly            the Monday after the week of the last finish
 */
export function nextDueDay(input: PaceInput, today: string): string | null {
  const { pace, lastFinishedDay: last } = input;
  if (pace === "own_pace") return null;
  if (!last) return today;
  if (pace === "daily") return addDays(last, 1);
  const nextMonday = addDays(weekStart(last), 7);
  if (pace === "weekly") return nextMonday;
  if ((input.finishedInThatWeek ?? 1) >= FEW_TIMES_PER_WEEK) return nextMonday;
  const gap = addDays(last, 2);
  return gap < nextMonday ? gap : nextMonday;
}

/** True when the pace suggests a part today. Always false on own pace. */
export function dueToday(input: PaceInput, today: string): boolean {
  const next = nextDueDay(input, today);
  return next !== null && next <= today;
}

export interface PaceReminderInput extends PaceInput {
  /** The local day the last step reminder for this workbook went, or null. */
  lastReminderDay: string | null;
  /** The local day the reader last opened or finished anything, when there has been no finish yet. */
  lastActiveDay?: string | null;
}

/**
 * Whether the reminder job may send today, on top of the reader's own
 * reminder days and time. On a scheduled pace it sends only on a due day. On
 * own pace it sends at most one gentle reminder a week, and only after a
 * quiet week. A reader who turns reminders off gets none at all; the job
 * never sees them.
 */
export function reminderAllowedByPace(input: PaceReminderInput, today: string): boolean {
  if (input.pace !== "own_pace") return dueToday(input, today);
  const quietSince = input.lastFinishedDay ?? input.lastActiveDay ?? null;
  if (quietSince && daysBetween(quietSince, today) < OWN_PACE_REMINDER_DAYS) return false;
  if (input.lastReminderDay && daysBetween(input.lastReminderDay, today) < OWN_PACE_REMINDER_DAYS) return false;
  return true;
}

/**
 * The pace input from an enrolment's progress events: the local day of the
 * last finished step and how many steps were finished in that calendar week.
 * Repeats (refs ending "~r") and events without a ref do not count.
 */
export function paceInputFromEvents(
  pace: Pace,
  events: readonly { kind: string; ref: string | null; at: string }[],
  localDay: (at: Date) => string,
): PaceInput {
  const days: { ref: string; day: string }[] = [];
  for (const e of events) {
    if (e.kind !== "step_done" || !e.ref || e.ref.endsWith("~r")) continue;
    const at = new Date(e.at);
    if (Number.isNaN(at.getTime())) continue;
    days.push({ ref: e.ref, day: localDay(at) });
  }
  if (days.length === 0) return { pace, lastFinishedDay: null, finishedInThatWeek: 0 };
  const last = days.reduce((a, d) => (d.day > a ? d.day : a), days[0]!.day);
  const week = weekStart(last);
  const inWeek = new Set(days.filter((d) => weekStart(d.day) === week).map((d) => d.ref));
  return { pace, lastFinishedDay: last, finishedInThatWeek: inWeek.size };
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export type LabelUnit = "week" | "day" | "module" | "chapter" | "part" | "unit";

const UNIT_LABEL: Record<LabelUnit, string> = { week: "Week", day: "Day", module: "Module", chapter: "Chapter", part: "Part", unit: "Unit" };

/** "Week", "Chapter", "Part". The plain label for a structure.unit. */
export function unitLabel(unit: LabelUnit): string {
  return UNIT_LABEL[unit];
}

/**
 * The label for a unit as the reader's pace sees it. A title written in
 * weeks, read at any pace but weekly, talks about parts, so a daily reader
 * never sees "Week 3" on the second day.
 */
export function paceUnitLabel(unit: LabelUnit, pace: Pace): string {
  if (unit === "week" && pace !== "weekly") return "Part";
  return UNIT_LABEL[unit];
}

/**
 * The rhythm line on Today and the reading screen when the pace is not
 * weekly: "Your next part" rather than "Week 2 of 4". The weekly pace keeps
 * rhythmLine in lib/today/week.ts.
 */
export function nextPartLine(i: { unit: LabelUnit; pace: Pace; number: number; count: number | null; due: boolean }): string {
  const label = paceUnitLabel(i.unit, i.pace);
  const where = i.count && i.count >= i.number ? `${label} ${i.number} of ${i.count}.` : `${label} ${i.number}.`;
  const lead = i.pace === "own_pace" ? "Your next part, at your own pace." : i.due ? "Your next part is ready." : "Your next part is there whenever you want it.";
  return `${lead} ${where}`;
}
