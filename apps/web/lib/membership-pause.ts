/**
 * Pause a membership (14.25), as pure helpers.
 *
 * A pause is the only save offer on the cancel screen. It lasts one, two or
 * three months. It starts at the end of the period the member has already
 * paid for, so nobody loses time they have paid for, and it ends on the date
 * the next payment is taken. Between the two the membership is suspended:
 * nothing is charged, the library is closed and every answer stays readable.
 *
 * In Stripe it is a pause_collection with behaviour "void". Stripe voids each
 * invoice made while it is set and leaves the subscription active. It
 * resumes at resumes_at, which is set one day before the first payment so
 * that payment is taken and is not voided. The window we hold ourselves
 * (public.subscriptions.paused_from and paused_until, migration 0045) runs
 * from the end of the paid period to the first payment, and the subscription
 * metadata carries the same two dates so the webhook can record them.
 *
 * Monthly plans only. A yearly plan renews once a year, so a pause of up to
 * three months would almost never void anything. A member on the yearly plan
 * is not offered one.
 */

export const PAUSE_MONTHS = [1, 2, 3] as const;
export type PauseMonths = (typeof PAUSE_MONTHS)[number];

const DAY_MS = 86_400_000;

export function parsePauseMonths(raw: unknown): PauseMonths | null {
  const n = typeof raw === "string" ? Number(raw) : raw;
  return n === 1 || n === 2 || n === 3 ? n : null;
}

/**
 * Whole calendar months after a date, in UTC. The day of the month is kept,
 * and clamped to the last day of a shorter month: 31 January plus one month
 * is 28 February (29 in a leap year). Time of day is kept.
 */
export function addMonthsUtc(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDay);
  return new Date(Date.UTC(y, m, day, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()));
}

export interface PauseWindow {
  months: PauseMonths;
  /** The end of the paid period. Access runs to here. */
  from: Date;
  /** The day the next payment is taken and access carries on. */
  until: Date;
  /** The pause_collection.resumes_at to send to Stripe: one day before `until`. */
  stripeResumesAt: Date;
}

/** The window for a pause that starts at the end of the paid period. */
export function pauseWindow(periodEnd: Date, months: PauseMonths): PauseWindow {
  const until = addMonthsUtc(periodEnd, months);
  return { months, from: periodEnd, until, stripeResumesAt: new Date(until.getTime() - DAY_MS) };
}

export type PauseRefusal = "not_running" | "ending" | "trial" | "already_paused" | "yearly" | "no_period_end";

export interface PauseSubject {
  plan: string | null;
  status: string;
  cancelAtPeriodEnd: boolean;
  cancelAt: string | null;
  currentPeriodEnd: string | null;
  pausedFrom: string | null;
  pausedUntil: string | null;
}

/** Why a pause cannot be offered, or null when it can. */
export function pauseRefusal(sub: PauseSubject, now: Date): PauseRefusal | null {
  if (sub.status === "trialing") return "trial";
  if (sub.status !== "active") return "not_running";
  if (sub.cancelAtPeriodEnd || sub.cancelAt) return "ending";
  if (sub.plan === "member_year") return "yearly";
  if (sub.pausedUntil && new Date(sub.pausedUntil).getTime() > now.getTime()) return "already_paused";
  if (!sub.currentPeriodEnd || new Date(sub.currentPeriodEnd).getTime() <= now.getTime()) return "no_period_end";
  return null;
}

export function canPause(sub: PauseSubject, now: Date): boolean {
  return pauseRefusal(sub, now) === null;
}

/** Where a pause stands now: none, set for later, or running. */
export type PauseState = { kind: "none" } | { kind: "ahead"; from: string; until: string } | { kind: "running"; until: string };

export function pauseState(sub: Pick<PauseSubject, "pausedFrom" | "pausedUntil">, now: Date): PauseState {
  if (!sub.pausedFrom || !sub.pausedUntil) return { kind: "none" };
  const from = new Date(sub.pausedFrom).getTime();
  const until = new Date(sub.pausedUntil).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(until) || until <= now.getTime()) return { kind: "none" };
  return from > now.getTime() ? { kind: "ahead", from: sub.pausedFrom, until: sub.pausedUntil } : { kind: "running", until: sub.pausedUntil };
}

/** The metadata keys on the Stripe subscription. An empty string unsets a key in Stripe. */
export const PAUSE_META_FROM = "pause_from";
export const PAUSE_META_UNTIL = "pause_until";

/** The two dates from a subscription's metadata, or null when there is no usable pair. */
export function pauseWindowFromMetadata(meta: Record<string, string | undefined> | null | undefined): { from: string; until: string } | null {
  const a = meta?.[PAUSE_META_FROM];
  const b = meta?.[PAUSE_META_UNTIL];
  if (!a || !b) return null;
  const f = new Date(a);
  const u = new Date(b);
  if (Number.isNaN(f.getTime()) || Number.isNaN(u.getTime()) || u.getTime() <= f.getTime()) return null;
  return { from: f.toISOString(), until: u.toISOString() };
}

/** "6 November 2026" in UK time. */
export function pauseDateWords(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(d);
}

/** The line shown beside the pause choices, per length. */
export function pauseOptionLine(periodEnd: Date, months: PauseMonths): string {
  const w = pauseWindow(periodEnd, months);
  return `${months === 1 ? "1 month" : `${months} months`}: access stops on ${pauseDateWords(w.from)} and payments restart on ${pauseDateWords(w.until)}.`;
}
