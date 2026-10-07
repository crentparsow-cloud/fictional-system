import { describe, expect, it } from "vitest";
import { MARKETS } from "@/lib/markets";
import { PRICE_LADDER, PRICE_TO_BE_CONFIRMED, priceFor, type Price, type PricePoint } from "@/lib/pricing";
import { DEMO_NOT_FOR_SALE, MEMBERSHIP_NOT_OPEN, paywallState, unitCountPhrase } from "./paywall";

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

  it("works with the real ladder: placeholders give null prices, so the offer is disabled", () => {
    const market = MARKETS.GB;
    const workbookPrice = priceFor({ pricePointId: "p3" }, market);
    const membershipPrice = priceFor({ pricePointId: "member_month" }, market);
    expect(workbookPrice).toBeNull();
    expect(membershipPrice).toBeNull();
    const s = paywallState({ entitled: false, demo: false, workbookPrice, membershipPrice });
    expect(s.kind === "offer" && [s.buy.enabled, s.membership.enabled]).toEqual([false, false]);

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
