/**
 * Membership trial (13.5, 5.3, 13.4), as pure helpers.
 *
 * Lengths: 14 days on the monthly plan, 21 on the annual plan, card
 * required. They are plain settings. public.app_config holds
 * membership_trial_days_monthly and membership_trial_days_yearly (migration
 * 0042); these defaults apply when a row is missing or unreadable. A length
 * of 0 means no trial on that plan.
 *
 * The reminder: Stripe sends customer.subscription.trial_will_end three days
 * before a trial ends (it sends it at once when a trial is shorter). The
 * reminder email goes out on that event, so the reminder date is the trial
 * end minus three days, and never earlier than the day the trial starts.
 * The offer, the checkout page and the day-zero email all state that date,
 * worked out here, so they cannot disagree.
 *
 * Wording rules (DMCC, CMA): a trial is never called free. The label is
 * "14 days, then £7.99 a month". Nothing counts down.
 */

export type TrialPlan = "monthly" | "yearly";

export const TRIAL_DEFAULT_DAYS: Readonly<Record<TrialPlan, number>> = Object.freeze({ monthly: 14, yearly: 21 });
export const TRIAL_MAX_DAYS = 60;
/** Stripe's own lead for customer.subscription.trial_will_end. */
export const TRIAL_REMINDER_LEAD_DAYS = 3;

export const TRIAL_CONFIG_KEYS: Readonly<Record<TrialPlan, string>> = Object.freeze({
  monthly: "membership_trial_days_monthly",
  yearly: "membership_trial_days_yearly",
});

export type TrialConfig = Readonly<Record<TrialPlan, number>>;

const DAY_MS = 86_400_000;

/** A whole number of days from 0 to TRIAL_MAX_DAYS, else the fallback. Accepts a number or a numeric string (jsonb may hold either). */
export function parseTrialDays(value: unknown, fallback: number): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > TRIAL_MAX_DAYS) return fallback;
  return n;
}

/** The trial lengths from app_config rows. Missing or malformed rows give the defaults. */
export function trialConfigFrom(rows: readonly { key: string; value: unknown }[] | null | undefined): TrialConfig {
  const byKey = new Map((rows ?? []).map((r) => [r.key, r.value]));
  return {
    monthly: parseTrialDays(byKey.get(TRIAL_CONFIG_KEYS.monthly), TRIAL_DEFAULT_DAYS.monthly),
    yearly: parseTrialDays(byKey.get(TRIAL_CONFIG_KEYS.yearly), TRIAL_DEFAULT_DAYS.yearly),
  };
}

/** Add whole days in UTC. Stripe's trial_period_days works the same way. */
export function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export interface TrialDates {
  startsAt: Date;
  /** When the trial ends and the first payment is taken. */
  trialEndsAt: Date;
  /** When the reminder email goes out. */
  reminderAt: Date;
  days: number;
}

/** The dates for a trial that starts at `start`, or null when the plan has no trial. */
export function trialDates(start: Date, days: number): TrialDates | null {
  if (!Number.isInteger(days) || days <= 0) return null;
  const trialEndsAt = addDaysUtc(start, days);
  const lead = addDaysUtc(trialEndsAt, -TRIAL_REMINDER_LEAD_DAYS);
  const reminderAt = lead.getTime() < start.getTime() ? start : lead;
  return { startsAt: start, trialEndsAt, reminderAt, days };
}

/** "6 October 2026" in UK time, so the date a reader sees is the date on their calendar. */
export function ukDateWords(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(date);
}

export function daysWords(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** The period wording used next to a price. */
export function periodWords(plan: TrialPlan): string {
  return plan === "monthly" ? "a month" : "a year";
}

/**
 * The trial label. "14 days, then £7.99 a month". Never the word free.
 * With no trial it is just the price and period.
 */
export function trialLabel(plan: TrialPlan, days: number, formattedPrice: string): string {
  const price = `${formattedPrice} ${periodWords(plan)}`;
  return days > 0 ? `${daysWords(days)}, then ${price}` : price;
}

/** Everything the offer and the checkout page say about the dates, in words. Null when there is no trial. */
export function trialDateLines(start: Date, days: number): { trialEnds: string; reminder: string; firstPayment: string; days: string } | null {
  const d = trialDates(start, days);
  if (!d) return null;
  return {
    days: daysWords(d.days),
    reminder: ukDateWords(d.reminderAt),
    trialEnds: ukDateWords(d.trialEndsAt),
    firstPayment: ukDateWords(d.trialEndsAt),
  };
}

/**
 * The sentence Stripe's page shows above the pay button for a trial: the
 * length, the first payment date and amount, the reminder date, and the way
 * to cancel. The price arrives formatted.
 */
export function trialCheckoutNotice(plan: TrialPlan, days: number, formattedPrice: string, start: Date): string | null {
  const lines = trialDateLines(start, days);
  if (!lines) return null;
  const every = plan === "monthly" ? "month" : "year";
  return (
    `Your trial lasts ${lines.days}. Nothing is taken today. On ${lines.firstPayment} we take ${formattedPrice}, and then ${formattedPrice} each ${every} until you cancel. ` +
    `We email you a reminder on ${lines.reminder}. To cancel, go to the You page, then Manage membership. If you cancel before ${lines.firstPayment}, you are not charged.`
  );
}

/**
 * One trial per reader. A reader with no subscription row of any status on
 * this storefront is eligible. Anyone who has held a membership before, even
 * one that ended, goes straight to the paid plan.
 */
export function trialEligible(existingSubscriptionRows: number): boolean {
  return existingSubscriptionRows === 0;
}
