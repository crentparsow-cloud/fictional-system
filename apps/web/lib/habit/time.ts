import { localParts } from "@/lib/today/reminders";

/**
 * Local-time helpers for the habit features. Everything goes through Intl,
 * so a change of clocks is handled and nothing is hard-coded to one zone.
 */

/** Offset of a zone from UTC at an instant, in milliseconds (positive east of Greenwich). */
export function tzOffsetMs(at: Date, timeZone: string): number {
  const p = localParts(at, timeZone);
  const [y, m, d] = p.date.split("-").map(Number) as [number, number, number];
  const localAsUtc = Date.UTC(y, m - 1, d, Math.floor(p.minutes / 60), p.minutes % 60);
  const instant = Math.floor(at.getTime() / 60_000) * 60_000;
  return localAsUtc - instant;
}

/** The instant at which a local date (YYYY-MM-DD) begins in a zone. */
export function localMidnightUtc(date: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - tzOffsetMs(new Date(guess), timeZone);
  // One more pass covers the day the clocks change.
  t = guess - tzOffsetMs(new Date(t), timeZone);
  return new Date(t);
}

/** The first day of the local month containing the instant, as YYYY-MM-DD. */
export function monthStartDate(at: Date, timeZone: string): string {
  return `${localParts(at, timeZone).date.slice(0, 7)}-01`;
}

/** The instant the current local month began. */
export function monthStartUtc(at: Date, timeZone: string): Date {
  return localMidnightUtc(monthStartDate(at, timeZone), timeZone);
}

/** The local date after the given one. */
export function nextDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
