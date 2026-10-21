import { hashSeed } from "@/lib/habit/companion";

/**
 * "On this day" (build list 4.3 enriched): the reader's own earlier answers,
 * resurfaced privately on Today. An answer is a candidate when it was last
 * written on the same day of the month one, three or six months ago, or one
 * or two years ago. Wellbeing titles stay off until the reader turns the
 * review on (the same dial as the daily review).
 */

export interface Anniversary {
  months: number;
  label: string;
}

export const ANNIVERSARIES: readonly Anniversary[] = [
  { months: 1, label: "A month ago" },
  { months: 3, label: "Three months ago" },
  { months: 6, label: "Six months ago" },
  { months: 12, label: "A year ago" },
  { months: 24, label: "Two years ago" },
];

export interface AnniversaryDay extends Anniversary {
  /** The local date to look for, YYYY-MM-DD. */
  date: string;
}

/** The same day of the month, n months earlier. A 31st lands on the last day of a shorter month. */
export function monthsBefore(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) - months;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return `${String(ty).padStart(4, "0")}-${String(tm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

export function anniversaryDays(today: string): AnniversaryDay[] {
  const seen = new Set<string>();
  const out: AnniversaryDay[] = [];
  for (const a of ANNIVERSARIES) {
    const date = monthsBefore(today, a.months);
    if (seen.has(date)) continue;
    seen.add(date);
    out.push({ ...a, date });
  }
  return out;
}

export interface Candidate {
  id: string;
  /** Local date the answer was last written, YYYY-MM-DD. */
  date: string;
}

/** The label for a candidate, from the day it was written. */
export function labelFor(date: string, days: readonly AnniversaryDay[]): string | null {
  return days.find((d) => d.date === date)?.label ?? null;
}

/**
 * Candidates in the order to try them today. Stable for a seed, so a refresh
 * shows the same answer, and the older ones come first because they are the
 * ones a reader is least likely to remember.
 */
export function orderCandidates<T extends Candidate>(items: readonly T[], seed: string): T[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1));
  const byDate = new Map<string, T[]>();
  for (const it of sorted) byDate.set(it.date, [...(byDate.get(it.date) ?? []), it]);
  const out: T[] = [];
  for (const [, group] of byDate) {
    const k = hashSeed(`${seed}|${group[0]!.date}`) % group.length;
    out.push(...group.slice(k), ...group.slice(0, k));
  }
  return out;
}
