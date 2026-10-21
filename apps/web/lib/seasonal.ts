/**
 * Seasonal collections (12.5) and dated editorial slots (7.10).
 *
 * A collection may carry a start and an end date. Outside the window it is
 * hidden from readers, and inside it, or with no dates, it shows as before.
 * The dates are UK calendar days (Europe/London). They are shown as dates, in
 * words: "Shown 1 December to 24 December". There is never a countdown, a
 * "days left" or a "last chance", and nothing here computes how long is left.
 * Migration 0062 applies the same window in the database policies.
 */

const TZ = "Europe/London";

/** Today's date in the UK, as YYYY-MM-DD. */
export function ukToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A YYYY-MM-DD string, or null for anything else. Strings compare correctly as dates. */
export function cleanDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.slice(0, 10);
  if (!ISO_DAY.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
}

/** True when today falls inside the window. A missing end means no limit on that side. */
export function inWindow(startsOn: string | null | undefined, endsOn: string | null | undefined, now: Date = new Date()): boolean {
  const today = ukToday(now);
  const s = cleanDay(startsOn);
  const e = cleanDay(endsOn);
  if (s && s > today) return false;
  if (e && e < today) return false;
  return true;
}

export function dayWords(day: string, withYear: boolean): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "long", ...(withYear ? { year: "numeric" } : {}) }).format(new Date(`${day}T00:00:00Z`));
}

/**
 * The window in words, for a collection page or tile: "Shown 1 December to
 * 24 December", "Shown from 1 December", "Shown until 24 December". Null when
 * the collection has no dates. The year appears only when a date is not in
 * the current year.
 */
export function windowLabel(startsOn: string | null | undefined, endsOn: string | null | undefined, now: Date = new Date()): string | null {
  const s = cleanDay(startsOn);
  const e = cleanDay(endsOn);
  if (!s && !e) return null;
  const year = ukToday(now).slice(0, 4);
  const withYear = [s, e].some((d) => d && d.slice(0, 4) !== year);
  if (s && e) return s === e ? `Shown on ${dayWords(s, withYear)}` : `Shown ${dayWords(s, withYear)} to ${dayWords(e, withYear)}`;
  if (s) return `Shown from ${dayWords(s as string, withYear)}`;
  return `Shown until ${dayWords(e as string, withYear)}`;
}
