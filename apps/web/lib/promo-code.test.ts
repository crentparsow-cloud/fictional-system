import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { marketFor } from "@/lib/markets";
import type { Price } from "@/lib/pricing";
import {
  discountedMinor,
  normalisePromoCode,
  offerSummary,
  paidLine,
  promoOfferFromStripe,
  type PromoOffer,
} from "./promo-code";

/** Promotion codes (item 5.9): what the /code page shows and the checkout routes pin. */

const GB = marketFor("GB");
const US = marketFor("US");

function stripeCode(
  over: Partial<Stripe.PromotionCode> = {},
  coupon: Partial<Stripe.Coupon> = {},
): Stripe.PromotionCode {
  return {
    id: "promo_1",
    object: "promotion_code",
    active: true,
    code: "firstbook",
    created: 1,
    customer: null,
    expires_at: null,
    livemode: false,
    max_redemptions: null,
    metadata: {},
    restrictions: {
      first_time_transaction: false,
      minimum_amount: null,
      minimum_amount_currency: null,
    },
    times_redeemed: 0,
    promotion: {
      type: "coupon",
      coupon: {
        id: "c1",
        object: "coupon",
        amount_off: null,
        created: 1,
        currency: null,
        duration: "once",
        duration_in_months: null,
        livemode: false,
        max_redemptions: null,
        metadata: {},
        name: null,
        percent_off: 20,
        redeem_by: null,
        times_redeemed: 0,
        valid: true,
        ...coupon,
      } as Stripe.Coupon,
    },
    ...over,
  } as Stripe.PromotionCode;
}

const price = (
  amountMinor: number,
  currency: Price["currency"] = "GBP",
  formatted = "£9.99",
): Price => ({ pointId: "p3", currency, amountMinor, formatted });

describe("normalisePromoCode", () => {
  it("upper cases and trims what the reader typed, and refuses anything that cannot be a code", () => {
    expect(normalisePromoCode(" firstbook ")).toBe("FIRSTBOOK");
    expect(normalisePromoCode("ak-2026_x")).toBe("AK-2026_X");
    expect(normalisePromoCode("")).toBeNull();
    expect(normalisePromoCode("has space")).toBeNull();
    expect(normalisePromoCode("-leading")).toBeNull();
    expect(normalisePromoCode("x".repeat(41))).toBeNull();
    expect(normalisePromoCode(undefined)).toBeNull();
  });
});

describe("promoOfferFromStripe", () => {
  it("reads a live percentage code", () => {
    const o = promoOfferFromStripe(stripeCode());
    expect(o).toMatchObject({
      id: "promo_1",
      code: "FIRSTBOOK",
      percentOff: 20,
      amountOffMinor: null,
      duration: "once",
      firstTimeOnly: false,
    });
  });

  it("reads a fixed amount with its currency and the first-payment restriction", () => {
    const o = promoOfferFromStripe(
      stripeCode(
        {
          restrictions: {
            first_time_transaction: true,
            minimum_amount: 500,
            minimum_amount_currency: "gbp",
          },
        },
        { percent_off: null, amount_off: 200, currency: "gbp" },
      ),
    );
    expect(o).toMatchObject({
      amountOffMinor: 200,
      currency: "GBP",
      percentOff: null,
      firstTimeOnly: true,
      minimumAmountMinor: 500,
      minimumCurrency: "GBP",
    });
  });

  it("refuses an inactive, expired, used up or invalid code", () => {
    const now = 1_800_000_000_000;
    expect(promoOfferFromStripe(stripeCode({ active: false }), now)).toBeNull();
    expect(
      promoOfferFromStripe(stripeCode({ expires_at: now / 1000 - 1 }), now),
    ).toBeNull();
    expect(
      promoOfferFromStripe(
        stripeCode({ max_redemptions: 3, times_redeemed: 3 }),
        now,
      ),
    ).toBeNull();
    expect(
      promoOfferFromStripe(stripeCode({}, { valid: false }), now),
    ).toBeNull();
    expect(
      promoOfferFromStripe(
        stripeCode({}, { percent_off: null, amount_off: null }),
        now,
      ),
    ).toBeNull();
  });
});

const pct20: PromoOffer = {
  id: "promo_1",
  code: "FIRSTBOOK",
  percentOff: 20,
  amountOffMinor: null,
  currency: null,
  duration: "once",
  durationInMonths: null,
  firstTimeOnly: false,
  minimumAmountMinor: null,
  minimumCurrency: null,
};
const off200: PromoOffer = {
  ...pct20,
  code: "TWOOFF",
  percentOff: null,
  amountOffMinor: 200,
  currency: "GBP",
};

describe("discountedMinor", () => {
  it("takes a percentage to the nearest penny and never goes below zero", () => {
    expect(discountedMinor(price(999), pct20)).toBe(799);
    expect(discountedMinor(price(1199), pct20)).toBe(959);
    expect(discountedMinor(price(100), { ...pct20, percentOff: 100 })).toBe(0);
  });

  it("takes a fixed amount only in its own currency", () => {
    expect(discountedMinor(price(999), off200)).toBe(799);
    expect(discountedMinor(price(150), off200)).toBe(0);
    expect(discountedMinor(price(999, "USD"), off200)).toBeNull();
  });

  it("respects a minimum amount", () => {
    expect(
      discountedMinor(price(499), {
        ...pct20,
        minimumAmountMinor: 500,
        minimumCurrency: "GBP",
      }),
    ).toBeNull();
    expect(
      discountedMinor(price(500), {
        ...pct20,
        minimumAmountMinor: 500,
        minimumCurrency: "GBP",
      }),
    ).toBe(400);
  });
});

describe("the words", () => {
  it("describes the code without any previous price", () => {
    expect(offerSummary(pct20, GB)).toBe("FIRSTBOOK takes 20% off.");
    expect(offerSummary({ ...pct20, percentOff: 12.5 }, GB)).toBe(
      "FIRSTBOOK takes 12.5% off.",
    );
    expect(offerSummary(off200, GB)).toBe("TWOOFF takes £2.00 off.");
  });

  it("says what is paid for a workbook, and for each membership plan by duration", () => {
    expect(paidLine(price(999), pct20, { kind: "workbook" }, GB)).toBe(
      "With code FIRSTBOOK you pay £7.99 for this workbook.",
    );
    const month: Price = {
      pointId: "member_month",
      currency: "GBP",
      amountMinor: 799,
      formatted: "£7.99",
    };
    const year: Price = {
      pointId: "member_year",
      currency: "GBP",
      amountMinor: 6999,
      formatted: "£69.99",
    };
    expect(
      paidLine(month, pct20, { kind: "membership", plan: "monthly" }, GB),
    ).toBe(
      "With code FIRSTBOOK you pay £6.39 for your first month, then £7.99 a month.",
    );
    expect(
      paidLine(
        month,
        { ...pct20, duration: "repeating", durationInMonths: 3 },
        { kind: "membership", plan: "monthly" },
        GB,
      ),
    ).toBe(
      "With code FIRSTBOOK you pay £6.39 a month for your first 3 months, then £7.99 a month.",
    );
    expect(
      paidLine(
        month,
        { ...pct20, duration: "forever" },
        { kind: "membership", plan: "monthly" },
        GB,
      ),
    ).toBe(
      "With code FIRSTBOOK you pay £6.39 a month for as long as you stay a member.",
    );
    expect(
      paidLine(year, pct20, { kind: "membership", plan: "yearly" }, GB),
    ).toBe(
      "With code FIRSTBOOK you pay £55.99 for your first year, then £69.99 a year.",
    );
  });

  it("never says was, and returns null when the code cannot apply", () => {
    for (const line of [
      paidLine(price(999), pct20, { kind: "workbook" }, GB),
      offerSummary(pct20, GB),
    ]) {
      expect(line?.toLowerCase()).not.toContain("was ");
    }
    expect(
      paidLine(price(999, "USD", "$9.99"), off200, { kind: "workbook" }, US),
    ).toBeNull();
  });
});
