import { describe, expect, it } from "vitest";
import { membershipCheckoutParams, type MembershipCheckoutInput } from "./membership";

const base: MembershipCheckoutInput = {
  plan: "two_monthly",
  priceId: "price_two",
  userId: "u1",
  tenantId: "t1",
  email: "a@b.org",
  customerId: null,
  successUrl: "https://x/ok",
  cancelUrl: "https://x/no",
};

describe("membershipCheckoutParams with a referral", () => {
  it("pins the coupon as the one discount and turns the code box off", () => {
    const p = membershipCheckoutParams({ ...base, couponId: "FRIEND5" });
    expect(p.discounts).toEqual([{ coupon: "FRIEND5" }]);
    expect(p.allow_promotion_codes).toBeUndefined();
  });
  it("lets a promotion code win over the coupon, because Checkout takes one discount", () => {
    const p = membershipCheckoutParams({ ...base, couponId: "FRIEND5", promotionCodeId: "promo_1" });
    expect(p.discounts).toEqual([{ promotion_code: "promo_1" }]);
  });
  it("keeps the code box when there is neither", () => {
    const p = membershipCheckoutParams(base);
    expect(p.allow_promotion_codes).toBe(true);
    expect(p.discounts).toBeUndefined();
  });
  it("adds the referral sentence to the pay button text and the longer trial to the subscription", () => {
    const p = membershipCheckoutParams({
      ...base,
      plan: "monthly",
      trial: { days: 28, notice: "Your trial lasts 28 days." },
      extraNotice: "Your trial includes 14 extra days from a friend's invitation.",
    });
    expect(p.subscription_data?.trial_period_days).toBe(28);
    const message = (p.custom_text?.submit as { message: string }).message;
    expect(message).toContain("Your trial lasts 28 days.");
    expect(message).toContain("14 extra days from a friend's invitation.");
  });
});
