import { describe, expect, it } from "vitest";
import { MARKETS } from "@/lib/markets";
import { PRICE_LADDER, PRICE_TO_BE_CONFIRMED, priceFor, type Price, type PricePoint } from "@/lib/pricing";
import { DEMO_NOT_FOR_SALE, MEMBERSHIP_NOT_OPEN, NOT_IN_MEMBERSHIP, paywallState, unitCountPhrase } from "./paywall";

const gbp: Price = { pointId: "p3", currency: "GBP", amountMinor: 1200, formatted: "£12.00" };
const member: Price = { pointId: "member_month", currency: "GBP", amountMinor: 800, formatted: "£8.00" };

describe("paywallState (F-019)", () => {
  it("opens the unit when the entitlement covers it, whatever else is true", () => {
    expect(paywallState({ entitled: true, demo: false, workbookPrice: gbp, membershipPrice: member })).toEqual({ kind: "open" });
    expect(paywallState({ entitled: true, demo: true, workbookPrice: null, membershipPrice: null })).toEqual({ kind: "open" });
  });

  it("shows no buttons for a demo title, only the plain line", () => {
    const s = paywallState({ entitled: false, demo: true, workbookPrice: gbp, membershipPrice: member, membershipCheckoutReady: true });
    expect(s).toEqual({ kind: "demo", message: DEMO_NOT_FOR_SALE });
  });

  it("disables both buttons with 'Price to be confirmed' while prices are placeholders", () => {
    const s = paywallState({ entitled: false, demo: false, workbookPrice: null, membershipPrice: null });
    expect(s).toEqual({
      kind: "offer",
      buy: { enabled: false, label: "Buy this workbook", note: PRICE_TO_BE_CONFIRMED },
      membership: { enabled: false, label: "Join the membership", note: PRICE_TO_BE_CONFIRMED },
    });
  });

  it("enables buy with the price once one exists", () => {
    const s = paywallState({ entitled: false, demo: false, workbookPrice: gbp, membershipPrice: null });
    expect(s.kind === "offer" && s.buy).toEqual({ enabled: true, label: "Buy this workbook", note: "£12.00" });
  });

  it("keeps membership disabled until its checkout exists, even with a price", () => {
    const notReady = paywallState({ entitled: false, demo: false, workbookPrice: gbp, membershipPrice: member });
    expect(notReady.kind === "offer" && notReady.membership).toEqual({ enabled: false, label: "Join the membership", note: MEMBERSHIP_NOT_OPEN });
    const ready = paywallState({ entitled: false, demo: false, workbookPrice: gbp, membershipPrice: member, membershipCheckoutReady: true });
    expect(ready.kind === "offer" && ready.membership).toEqual({ enabled: true, label: "Join the membership", note: "£8.00 a month" });
  });

  it("has no pressure words in any state", () => {
    const states = [
      paywallState({ entitled: false, demo: true, workbookPrice: null, membershipPrice: null }),
      paywallState({ entitled: false, demo: false, workbookPrice: null, membershipPrice: null }),
      paywallState({ entitled: false, demo: false, workbookPrice: gbp, membershipPrice: member, membershipCheckoutReady: true }),
    ];
    const text = JSON.stringify(states).toLowerCase();
    for (const w of ["only today", "hurry", "last chance", "left", "ends", "limited", "countdown", "now only"]) expect(text).not.toContain(w);
  });

  it("works with the real ladder: an unpriced workbook point is disabled, the membership price shows", () => {
    const market = MARKETS.GB;
    const workbookPrice = priceFor({ pricePointId: "p3" }, market, { ...PRICE_LADDER, p3: { ...PRICE_LADDER.p3, amounts: {}, active: false } });
    const membershipPrice = priceFor({ pricePointId: "member_month" }, market);
    const membershipYearlyPrice = priceFor({ pricePointId: "member_year" }, market);
    expect(workbookPrice).toBeNull();
    expect(priceFor({ pricePointId: "p3" }, market)?.formatted).toBe("£9.99");
    expect(membershipPrice?.formatted).toBe("£7.99");
    const s = paywallState({ entitled: false, demo: false, workbookPrice, membershipPrice });
    expect(s.kind === "offer" && [s.buy.enabled, s.membership.enabled]).toEqual([false, false]);
    const open = paywallState({ entitled: false, demo: false, workbookPrice, membershipPrice, membershipCheckoutReady: true, membershipYearlyPrice, membershipYearlyReady: true });
    expect(open.kind === "offer" && open.membership).toEqual({ enabled: true, label: "Join the membership", note: "£7.99 a month" });
    expect(open.kind === "offer" && open.yearly).toEqual({ label: "Or pay £69.99 a year" });
    // A demo title still shows no buttons at all, whatever the membership price.
    expect(paywallState({ entitled: false, demo: true, workbookPrice, membershipPrice, membershipCheckoutReady: true })).toEqual({ kind: "demo", message: DEMO_NOT_FOR_SALE });

    const priced: PricePoint = { ...PRICE_LADDER.p3, amounts: { GBP: 1200 }, active: true };
    const live = priceFor({ pricePointId: "p3" }, market, { p3: priced });
    expect(live?.amountMinor).toBe(1200);
    expect(priceFor({ pricePointId: "p3", isDemo: true }, market, { p3: priced })).toBeNull();
  });

  it("says the unit count in plain words", () => {
    expect(unitCountPhrase(8, "week")).toBe("8 weeks");
    expect(unitCountPhrase(1, "module")).toBe("1 module");
  });
});

describe("paywallState membership options (F-097)", () => {
  const yearly: Price = { pointId: "member_year", currency: "GBP", amountMinor: 8000, formatted: "£80.00" };

  it("offers the annual plan quietly under the monthly button once it is open", () => {
    const s = paywallState({
      entitled: false,
      demo: false,
      workbookPrice: gbp,
      membershipPrice: member,
      membershipCheckoutReady: true,
      membershipYearlyPrice: yearly,
      membershipYearlyReady: true,
    });
    expect(s.kind === "offer" && s.yearly).toEqual({ label: "Or pay £80.00 a year" });
  });

  it("leaves the annual line out while its price or its checkout is missing", () => {
    const noPrice = paywallState({ entitled: false, demo: false, workbookPrice: gbp, membershipPrice: member, membershipYearlyReady: true });
    const notReady = paywallState({ entitled: false, demo: false, workbookPrice: gbp, membershipPrice: member, membershipYearlyPrice: yearly });
    expect(noPrice.kind === "offer" && "yearly" in noPrice).toBe(false);
    expect(notReady.kind === "offer" && "yearly" in notReady).toBe(false);
  });

  it("says plainly when a title is not in the membership, and offers no annual line", () => {
    const s = paywallState({
      entitled: false,
      demo: false,
      workbookPrice: gbp,
      membershipPrice: member,
      membershipCheckoutReady: true,
      membershipYearlyPrice: yearly,
      membershipYearlyReady: true,
      inMembership: false,
    });
    expect(s).toEqual({
      kind: "offer",
      buy: { enabled: true, label: "Buy this workbook", note: "£12.00" },
      membership: { enabled: false, label: "Join the membership", note: NOT_IN_MEMBERSHIP },
    });
  });

  it("keeps the new lines free of em dashes and pressure words", () => {
    const s = paywallState({
      entitled: false,
      demo: false,
      workbookPrice: gbp,
      membershipPrice: member,
      membershipCheckoutReady: true,
      membershipYearlyPrice: yearly,
      membershipYearlyReady: true,
    });
    const text = JSON.stringify([s, NOT_IN_MEMBERSHIP]);
    expect(text).not.toMatch(/—|–/);
    for (const w of ["only today", "hurry", "last chance", "limited"]) expect(text.toLowerCase()).not.toContain(w);
  });
});

describe("the two-person option (0041)", () => {
  const two: Price = { pointId: "member_two_month", currency: "GBP", amountMinor: 1200, formatted: "£12.00", inGbp: true } as Price;
  const base = { entitled: false, demo: false, workbookPrice: gbp, membershipPrice: member, membershipCheckoutReady: true } as const;

  it("is absent unless the plan has a price and a Stripe price", () => {
    for (const extra of [{}, { membershipTwoPrice: two }, { membershipTwoReady: true }, { membershipTwoPrice: null, membershipTwoReady: true }]) {
      const s = paywallState({ ...base, ...extra });
      expect(s.kind === "offer" && "shared" in s).toBe(false);
    }
  });

  it("carries the positioning line and the price when it can be bought", () => {
    const s = paywallState({ ...base, membershipTwoPrice: two, membershipTwoReady: true });
    expect(s.kind === "offer" && s.shared).toEqual({
      positioning: "Two people, one price, each with sealed answers",
      label: "Share a membership, £12.00 a month for two people",
    });
  });

  it("is hidden for a title outside the membership", () => {
    const s = paywallState({ ...base, inMembership: false, membershipTwoPrice: two, membershipTwoReady: true });
    expect(s.kind === "offer" && "shared" in s).toBe(false);
  });
});

describe("paywallState trial and annual labels (5.3, 13.5, 14.21)", () => {
  const monthly: Price = { pointId: "member_month", currency: "GBP", amountMinor: 799, formatted: "£7.99" };
  const yearly: Price = { pointId: "member_year", currency: "GBP", amountMinor: 6999, formatted: "£69.99" };
  const base = { entitled: false, demo: false, workbookPrice: gbp, membershipPrice: monthly, membershipCheckoutReady: true, membershipYearlyPrice: yearly, membershipYearlyReady: true } as const;

  it("labels the membership '14 days, then £7.99 a month', never free", () => {
    const s = paywallState({ ...base, membershipTrial: { monthly: 14, yearly: 21 }, market: MARKETS.GB });
    expect(s.kind === "offer" && s.membership.note).toBe("14 days, then £7.99 a month");
    expect(s.kind === "offer" && s.trialDays).toBe(14);
    expect(JSON.stringify(s)).not.toMatch(/free/i);
  });

  it("shows the annual plan as a monthly equivalent with the yearly total beside it", () => {
    const s = paywallState({ ...base, membershipTrial: { monthly: 14, yearly: 21 }, market: MARKETS.GB });
    expect(s.kind === "offer" && s.yearly?.label).toBe("Or 21 days, then £5.83 a month, £69.99 a year");
    const noTrial = paywallState({ ...base, market: MARKETS.GB });
    expect(noTrial.kind === "offer" && noTrial.yearly?.label).toBe("Or £5.83 a month, £69.99 a year");
    expect(noTrial.kind === "offer" && noTrial.membership.note).toBe("£7.99 a month");
    expect(noTrial.kind === "offer" && "trialDays" in noTrial).toBe(false);
  });

  it("a trial of 0 days reads as no trial", () => {
    const s = paywallState({ ...base, membershipTrial: { monthly: 0, yearly: 0 } });
    expect(s.kind === "offer" && s.membership.note).toBe("£7.99 a month");
  });
});
