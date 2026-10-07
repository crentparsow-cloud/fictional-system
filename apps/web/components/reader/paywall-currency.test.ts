import { describe, expect, it } from "vitest";
import { GBP_PRICE_NOTE, type Price } from "@/lib/pricing";
import { paywallState } from "./paywall";

/** The GBP note on the calm paywall (F-094). Everything else about the card is unchanged. */
const local: Price = { pointId: "p3", currency: "GBP", amountMinor: 1200, formatted: "£12.00" };
const abroad: Price = { ...local, inGbp: true };
const memberAbroad: Price = { pointId: "member_month", currency: "GBP", amountMinor: 799, formatted: "£7.99", inGbp: true };
const yearlyAbroad: Price = { pointId: "member_year", currency: "GBP", amountMinor: 6999, formatted: "£69.99", inGbp: true };

describe("paywallState currency note (F-094)", () => {
  it("adds no note when every price is in the reader's own currency", () => {
    const s = paywallState({ entitled: false, demo: false, workbookPrice: local, membershipPrice: null });
    expect(s).not.toHaveProperty("currencyNote");
  });

  it("adds the GBP note when the workbook price is shown in GBP abroad", () => {
    const s = paywallState({ entitled: false, demo: false, workbookPrice: abroad, membershipPrice: null });
    expect(s).toMatchObject({ kind: "offer", buy: { enabled: true, note: "£12.00" }, currencyNote: GBP_PRICE_NOTE });
  });

  it("adds the note for a membership price in GBP only when that button can be used", () => {
    const closed = paywallState({ entitled: false, demo: false, workbookPrice: null, membershipPrice: memberAbroad, membershipCheckoutReady: false });
    expect(closed).not.toHaveProperty("currencyNote");
    const open = paywallState({ entitled: false, demo: false, workbookPrice: null, membershipPrice: memberAbroad, membershipCheckoutReady: true });
    expect(open).toMatchObject({ currencyNote: GBP_PRICE_NOTE, membership: { enabled: true, note: "£7.99 a month" } });
  });

  it("adds the note for the yearly line in GBP", () => {
    const s = paywallState({
      entitled: false,
      demo: false,
      workbookPrice: null,
      membershipPrice: null,
      membershipYearlyPrice: yearlyAbroad,
      membershipYearlyReady: true,
    });
    expect(s).toMatchObject({ yearly: { label: "Or pay £69.99 a year" }, currencyNote: GBP_PRICE_NOTE });
  });

  it("never shows the note on a demo title", () => {
    expect(paywallState({ entitled: false, demo: true, workbookPrice: abroad, membershipPrice: memberAbroad })).not.toHaveProperty("currencyNote");
  });
});
