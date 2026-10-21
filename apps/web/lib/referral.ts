import type { MembershipPlan } from "@/lib/membership";

/**
 * Reader referrals (6.3 and 13.11), as pure helpers. The figures come from
 * public.app_config under the key "referral" (migration 0051); these defaults
 * apply when the row is missing or unreadable. Nothing here is a price: the
 * pounds are minor units by currency, and a currency with no figure gets no
 * money reward or discount.
 *
 * The rules, in the words every referral message uses:
 *  - the friend has to pay before any credit lands;
 *  - the friend gets extra trial days, or an amount off the first payment on
 *    a plan with no trial;
 *  - the referrer gets credit (never cash), or extra trial days while still on
 *    a trial;
 *  - at most `annualCap` rewards a year for each reader.
 * The reader shares the link through their own channels. Akana never emails
 * the friend (ASA Beer52 ruling, ICO PECR instigator rule).
 */

export interface ReferralConfig {
  friendTrialDays: number;
  /** Minor units off the first payment of a plan with no trial, by currency code. */
  friendOffMinor: Readonly<Record<string, number>>;
  /** The referrer's account credit, minor units by currency code. */
  referrerCreditMinor: Readonly<Record<string, number>>;
  referrerTrialDays: number;
  annualCap: number;
}

export const REFERRAL_DEFAULTS: ReferralConfig = Object.freeze({
  friendTrialDays: 14,
  friendOffMinor: Object.freeze({ GBP: 500 }),
  referrerCreditMinor: Object.freeze({ GBP: 500 }),
  referrerTrialDays: 14,
  annualCap: 12,
});

const MAX_DAYS = 60;
const MAX_CAP = 100;

function wholeNumber(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

function amounts(v: unknown, fallback: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return fallback;
  const out: Record<string, number> = {};
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!/^[A-Z]{3}$/.test(k)) continue;
    const n = wholeNumber(raw, 0, 1_000_000, -1);
    if (n >= 0) out[k] = n;
  }
  return out;
}

/** The settings from the app_config value. Anything malformed falls back to its default. */
export function referralConfigFrom(value: unknown): ReferralConfig {
  const v = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    friendTrialDays: wholeNumber(v.friend_trial_days, 0, MAX_DAYS, REFERRAL_DEFAULTS.friendTrialDays),
    friendOffMinor: amounts(v.friend_off_minor, REFERRAL_DEFAULTS.friendOffMinor),
    referrerCreditMinor: amounts(v.referrer_credit_minor, REFERRAL_DEFAULTS.referrerCreditMinor),
    referrerTrialDays: wholeNumber(v.referrer_trial_days, 0, MAX_DAYS, REFERRAL_DEFAULTS.referrerTrialDays),
    annualCap: wholeNumber(v.annual_cap, 1, MAX_CAP, REFERRAL_DEFAULTS.annualCap),
  };
}

export type FriendBenefit =
  | { kind: "trial_days"; /** Days added to the normal trial. */ extraDays: number; /** The whole trial in days. */ totalDays: number }
  | { kind: "first_payment_off"; minor: number; currency: string };

export interface FriendBenefitInput {
  plan: MembershipPlan;
  /** The normal trial length for the plan, 0 when there is none. */
  baseTrialDays: number;
  /** False when the friend has held a membership before. */
  trialEligible: boolean;
  currency: string;
  config: ReferralConfig;
  /** The Stripe coupon that takes the amount off, or null when it is not set up. */
  couponId: string | null;
  /** A promotion code is already on the session; Stripe takes one discount only. */
  promoCodeUsed: boolean;
}

const TWO_PERSON: readonly MembershipPlan[] = ["two_monthly", "two_yearly"];
export const isTwoPersonPlan = (plan: MembershipPlan): boolean => TWO_PERSON.includes(plan);

/**
 * What the friend is offered at checkout, or null for nothing. A plan with a
 * trial gets extra trial days on top of the normal trial. The two-person
 * plan has no trial, so it gets an amount off the first payment, but only
 * while the coupon is set and no promotion code is on the session.
 */
export function friendBenefit(i: FriendBenefitInput): FriendBenefit | null {
  if (isTwoPersonPlan(i.plan)) {
    if (!i.couponId || i.promoCodeUsed) return null;
    const minor = i.config.friendOffMinor[i.currency.toUpperCase()] ?? 0;
    return minor > 0 ? { kind: "first_payment_off", minor, currency: i.currency.toUpperCase() } : null;
  }
  if (!i.trialEligible || i.baseTrialDays <= 0 || i.config.friendTrialDays <= 0) return null;
  return { kind: "trial_days", extraDays: i.config.friendTrialDays, totalDays: i.baseTrialDays + i.config.friendTrialDays };
}

/** The Stripe coupon id for the amount-off, from STRIPE_COUPON_REFERRAL_FRIEND. Blank means the amount-off is not offered. */
export function referralCouponId(env: Record<string, string | undefined> = process.env): string | null {
  const v = env.STRIPE_COUPON_REFERRAL_FRIEND?.trim();
  return v && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null;
}

const CODE = /^[0-9A-Fa-f]{10}$/;
export const isReferralCode = (v: unknown): v is string => typeof v === "string" && CODE.test(v);

/** The link a reader shares. The code sits in the path. */
export function referralUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/r/${code.toUpperCase()}`;
}

function money(minor: number, currency: string): string {
  const major = minor / 100;
  const symbol = currency === "GBP" ? "£" : currency === "USD" ? "$" : currency === "EUR" ? "€" : `${currency} `;
  return `${symbol}${Number.isInteger(major) ? major : major.toFixed(2)}`;
}

/** The conditions, stated with every referral message and on the invitation page. */
export function referralConditions(config: ReferralConfig, currency = "GBP"): string[] {
  const credit = config.referrerCreditMinor[currency] ?? 0;
  const off = config.friendOffMinor[currency] ?? 0;
  const lines = [
    `Your friend gets ${config.friendTrialDays} extra days on top of the normal trial.${off > 0 ? ` On the membership for two people, which has no trial, they get ${money(off, currency)} off the first payment instead.` : ""}`,
    `You are rewarded only after your friend has made their first payment and it has cleared.${credit > 0 ? ` The reward is ${money(credit, currency)} of account credit. If you are still on a trial, it is ${config.referrerTrialDays} extra trial days instead.` : ""}`,
    "Credit is only ever taken off a future bill. It is never paid out as cash.",
    `Each reader can be rewarded for up to ${config.annualCap} friends a year.`,
    "Your friend needs to be new to Akana, and the link only works for a different person with a different card.",
    "Akana never emails your friend. You share the link yourself.",
  ];
  return lines;
}

export type ReferralUse = "attached" | "already" | "self" | "unknown_code" | "not_new";

export const REFERRAL_USE_MESSAGES: Readonly<Record<ReferralUse, string>> = {
  attached: "Your invitation is saved. It will apply when you start a membership.",
  already: "You have already used an invitation, so that one stays.",
  self: "This is your own link, so it cannot be used on your own account.",
  unknown_code: "That invitation link is not valid.",
  not_new: "Invitations are for people who are new to Akana.",
};

export function isReferralUse(v: unknown): v is ReferralUse {
  return typeof v === "string" && v in REFERRAL_USE_MESSAGES;
}

export interface ReferralSummary {
  invited: number;
  rewardedThisYear: number;
  cap: number;
  creditMinor: number;
  creditCurrency: string;
}

/** The line under the reader's link on the You page. Counts only. */
export function referralSummaryLine(s: ReferralSummary): string {
  const left = Math.max(0, s.cap - s.rewardedThisYear);
  const credit = s.creditMinor > 0 ? ` You have earned ${money(s.creditMinor, s.creditCurrency)} of credit so far.` : "";
  return `${s.invited} ${s.invited === 1 ? "friend has" : "friends have"} used your link. ${s.rewardedThisYear} of ${s.cap} rewards used this year, ${left} left.${credit}`;
}
