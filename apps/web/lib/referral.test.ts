import { describe, expect, it } from "vitest";
import {
  REFERRAL_DEFAULTS,
  friendBenefit,
  isReferralCode,
  referralConditions,
  referralConfigFrom,
  referralCouponId,
  referralSummaryLine,
  referralUrl,
  type FriendBenefitInput,
} from "./referral";

const base: FriendBenefitInput = {
  plan: "monthly",
  baseTrialDays: 14,
  trialEligible: true,
  currency: "GBP",
  config: REFERRAL_DEFAULTS,
  couponId: "coupon_ref",
  promoCodeUsed: false,
};

describe("referral config", () => {
  it("uses the defaults when the row is missing or not an object", () => {
    expect(referralConfigFrom(null)).toEqual(REFERRAL_DEFAULTS);
    expect(referralConfigFrom("x")).toEqual(REFERRAL_DEFAULTS);
    expect(referralConfigFrom([])).toEqual(REFERRAL_DEFAULTS);
  });
  it("reads good values and ignores bad ones one by one", () => {
    const c = referralConfigFrom({
      friend_trial_days: 21,
      friend_off_minor: { GBP: 300, usd: 5, EUR: -1, XX: 4 },
      referrer_credit_minor: { GBP: "700" },
      referrer_trial_days: 9999,
      annual_cap: 0,
    });
    expect(c.friendTrialDays).toBe(21);
    expect(c.friendOffMinor).toEqual({ GBP: 300 });
    expect(c.referrerCreditMinor).toEqual({ GBP: 700 });
    expect(c.referrerTrialDays).toBe(14);
    expect(c.annualCap).toBe(12);
  });
});

describe("friendBenefit", () => {
  it("adds the extra days to the normal trial", () => {
    expect(friendBenefit(base)).toEqual({ kind: "trial_days", extraDays: 14, totalDays: 28 });
    expect(friendBenefit({ ...base, plan: "yearly", baseTrialDays: 21 })).toEqual({ kind: "trial_days", extraDays: 14, totalDays: 35 });
  });
  it("gives no trial days to someone who has held a membership, or when the plan has no trial", () => {
    expect(friendBenefit({ ...base, trialEligible: false })).toBeNull();
    expect(friendBenefit({ ...base, baseTrialDays: 0 })).toBeNull();
    expect(friendBenefit({ ...base, config: { ...REFERRAL_DEFAULTS, friendTrialDays: 0 } })).toBeNull();
  });
  it("gives the amount off on the two-person plans", () => {
    expect(friendBenefit({ ...base, plan: "two_monthly", baseTrialDays: 0 })).toEqual({ kind: "first_payment_off", minor: 500, currency: "GBP" });
    expect(friendBenefit({ ...base, plan: "two_yearly", baseTrialDays: 0 })?.kind).toBe("first_payment_off");
  });
  it("offers no amount off without the coupon, with a promotion code, or in a currency with no figure", () => {
    const two = { ...base, plan: "two_monthly" as const, baseTrialDays: 0 };
    expect(friendBenefit({ ...two, couponId: null })).toBeNull();
    expect(friendBenefit({ ...two, promoCodeUsed: true })).toBeNull();
    expect(friendBenefit({ ...two, currency: "USD" })).toBeNull();
  });
});

describe("links and words", () => {
  it("reads the coupon from the environment and treats blank as off", () => {
    expect(referralCouponId({})).toBeNull();
    expect(referralCouponId({ STRIPE_COUPON_REFERRAL_FRIEND: "  " })).toBeNull();
    expect(referralCouponId({ STRIPE_COUPON_REFERRAL_FRIEND: "bad coupon!" })).toBeNull();
    expect(referralCouponId({ STRIPE_COUPON_REFERRAL_FRIEND: "FRIEND5" })).toBe("FRIEND5");
  });
  it("builds the link with the code in the path", () => {
    expect(referralUrl("https://akana.example/", "abcdef0123")).toBe("https://akana.example/r/ABCDEF0123");
    expect(isReferralCode("ABCDEF0123")).toBe(true);
    expect(isReferralCode("../etc")).toBe(false);
  });
  it("states every condition the law spec needs, without em dashes or the word free", () => {
    const text = referralConditions(REFERRAL_DEFAULTS).join(" ");
    expect(text).toMatch(/first payment and it has cleared/);
    expect(text).toMatch(/never paid out as cash/);
    expect(text).toMatch(/up to 12 friends a year/);
    expect(text).toMatch(/Akana never emails your friend/);
    expect(text).toMatch(/£5/);
    expect(text).not.toMatch(/—|\bfree\b/i);
  });
  it("summarises with counts only", () => {
    const line = referralSummaryLine({ invited: 3, rewardedThisYear: 2, cap: 12, creditMinor: 1000, creditCurrency: "GBP" });
    expect(line).toBe("3 friends have used your link. 2 of 12 rewards used this year, 10 left. You have earned £10 of credit so far.");
    expect(referralSummaryLine({ invited: 1, rewardedThisYear: 0, cap: 12, creditMinor: 0, creditCurrency: "GBP" })).toBe(
      "1 friend has used your link. 0 of 12 rewards used this year, 12 left.",
    );
  });
});
