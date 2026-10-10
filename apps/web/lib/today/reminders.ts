import type { ProgrammeStep } from "@/lib/today/steps";
import { unitWordLabel, type UnitWord } from "@/lib/today/week";

/**
 * Email reminders (4.7) that stop themselves (14.3). Pure rules, so the
 * route that sends can stay thin and the rules can be tested.
 *
 *  - A reminder goes only on the days and at the time the reader chose, in
 *    the time zone they chose, and only when they turned reminders on.
 *  - It names the step by its unit name, never the workbook title. For a
 *    wellbeing title the subject says only the unit number.
 *  - After N reminders in a row with nothing opened or finished in between,
 *    the next one is a single email saying the reminders are stopping and how
 *    to start them again. Then they are off until the reader turns them on.
 *  - Nothing here counts days, and no wording mentions anything missed.
 */

export const DEFAULT_STOP_AFTER = 4;
/** A reminder is still sent up to this many minutes after its time, in case a run was late. */
export const SEND_WINDOW_MINUTES = 180;

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export interface LocalParts {
  /** YYYY-MM-DD in the reader's zone. */
  date: string;
  /** ISO weekday, Monday 1 to Sunday 7. */
  isoDow: number;
  minutes: number;
}

export function validTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return tz.length > 0 && tz.length <= 64;
  } catch {
    return false;
  }
}

export function localParts(at: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    isoDow: dow,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

export function parseTime(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h <= 23 && mi <= 59 ? h * 60 + mi : null;
}

export interface ReminderSetting {
  enabled: boolean;
  days: readonly number[];
  time: string;
  timeZone: string;
}

/** Is a reminder due now? True from the chosen time until SEND_WINDOW_MINUTES later, on a chosen day. */
export function reminderDue(setting: ReminderSetting, now: Date): { due: boolean; localDate: string } {
  const local = localParts(now, validTimeZone(setting.timeZone) ? setting.timeZone : "Europe/London");
  const at = parseTime(setting.time);
  if (!setting.enabled || at === null || !setting.days.includes(local.isoDow)) return { due: false, localDate: local.date };
  const late = local.minutes - at;
  return { due: late >= 0 && late <= SEND_WINDOW_MINUTES, localDate: local.date };
}

export type ReminderAction = "send" | "stop_notice" | "none";

/**
 * What to do with a reader whose reminder is due. sentSinceActivity is the
 * number of reminders sent after the reader last opened or finished anything
 * in the programme. At the limit, the next due moment sends the one stopping
 * email instead of another reminder.
 */
export function reminderAction(args: { enabled: boolean; sentSinceActivity: number; stopAfter: number }): ReminderAction {
  if (!args.enabled) return "none";
  const limit = Math.max(1, Math.floor(args.stopAfter) || DEFAULT_STOP_AFTER);
  return args.sentSinceActivity >= limit ? "stop_notice" : "send";
}

/** Reminders sent after the reader's last activity. Sends before it were answered, whatever the reader did. */
export function sentSinceActivity(sentAt: readonly string[], lastActivity: Date | null): number {
  if (!lastActivity) return sentAt.length;
  return sentAt.filter((s) => Date.parse(s) > lastActivity.getTime()).length;
}

/** One email per reader per step per local day. Ids and a date only, no address, under 200 characters. */
export function reminderKey(userId: string, enrolmentId: string, exerciseId: string, localDate: string): string {
  return `step-reminder:${userId}:${enrolmentId}:${exerciseId}:${localDate}`;
}
export function stoppingKey(enrolmentId: string, localDate: string): string {
  return `reminder-stop:${enrolmentId}:${localDate}`;
}
export function welcomeBackKey(enrolmentId: string, lastActivity: Date): string {
  return `welcome-back:${enrolmentId}:${lastActivity.toISOString().slice(0, 10)}`;
}

export interface StepNaming {
  /** The unit's name, for the body of the email. */
  stepName: string;
  /** "Week 3", for the panel title. */
  unitWords: string;
  /** What follows "Akana today:" in the subject. */
  subjectLabel: string;
}

const SUBJECT_MAX = 48;

/**
 * Names a step by its unit name, never the workbook title. A unit name that
 * contains the title (or short title) falls back to the unit number. For a
 * wellbeing title, the subject and the calendar carry the number only, so a
 * topic never shows on a lock screen.
 */
export function nameStep(
  step: Pick<ProgrammeStep, "unit" | "unitName">,
  unitWord: UnitWord,
  titles: readonly (string | null | undefined)[],
  safetyTier: "none" | "standard" | "higher",
): StepNaming {
  const unitWords = `${unitWordLabel(unitWord)} ${step.unit}`;
  const name = step.unitName.trim();
  const lower = name.toLowerCase();
  const clash = !name || titles.some((t) => t && t.trim().length >= 3 && lower.includes(t.trim().toLowerCase()));
  const stepName = clash ? unitWords : name;
  const subjectLabel = safetyTier !== "none" || clash ? unitWords : name.length > SUBJECT_MAX ? `${name.slice(0, SUBJECT_MAX - 3).trimEnd()}...` : name;
  return { stepName, unitWords, subjectLabel };
}

/** Order readers' programmes so a reader with two reminders due on one day gets one email, for the most recent. */
export function oneProgrammePerReader<T extends { userId: string; lastOpenedAt: string }>(items: readonly T[]): T[] {
  const best = new Map<string, T>();
  for (const it of items) {
    const cur = best.get(it.userId);
    if (!cur || Date.parse(it.lastOpenedAt) > Date.parse(cur.lastOpenedAt)) best.set(it.userId, it);
  }
  return [...best.values()];
}
