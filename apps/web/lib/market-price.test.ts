import { describe, expect, it } from "vitest";
import { MARKETS } from "@/lib/markets";
import { GBP_PRICE_NOTE, PRICE_LADDER, marketPriceFor, priceFor, type PricePoint } from "@/lib/pricing";

/** Local currency display (F-094). */
const gbpOnly: PricePoint = { ...PRICE_LADDER.p3, amounts: { GBP: 1200 }, active: true };
const gbpAndUsd: PricePoint = { ...PRICE_LADDER.p3, amounts: { GBP: 1200, USD: 1500 }, active: true };
const usdOnly: PricePoint = { ...PRICE_LADDER.p3, amounts: { USD: 1500 }, active: true };
const wb = { pricePointId: "p3" };

describe("marketPriceFor (F-094)", () => {
  it("shows GBP to a UK reader with no note", () => {
    const p = marketPriceFor(wb, MARKETS.GB, { p3: gbpOnly });
    expect(p).toMatchObject({ currency: "GBP", amountMinor: 1200, formatted: "£12.00" });
    expect(p?.inGbp).toBeUndefined();
  });

  it("shows the market's own currency where price_points has a figure", () => {
    const p = marketPriceFor(wb, MARKETS.US, { p3: gbpAndUsd });
    expect(p).toMatchObject({ currency: "USD", amountMinor: 1500, formatted: "$15.00" });
    expect(p?.inGbp).toBeUndefined();
  });

  it("falls back to GBP, in the reader's locale, and marks it, when the market currency has no figure", () => {
    const us = marketPriceFor(wb, MARKETS.US, { p3: gbpOnly });
    expect(us).toEqual({ pointId: "p3", currency: "GBP", amountMinor: 1200, formatted: "£12.00", inGbp: true });
    const ie = marketPriceFor(wb, MARKETS.IE, { p3: gbpOnly });
    expect(ie).toMatchObject({ currency: "GBP", amountMinor: 1200, inGbp: true });
    expect(ie?.formatted).toContain("12.00");
    expect(ie?.formatted).toContain("£");
    expect(marketPriceFor(wb, MARKETS.XX, { p3: gbpOnly })).toMatchObject({ currency: "GBP", inGbp: true });
  });

  it("never converts: a point with no GBP and no market figure has no price", () => {
    expect(marketPriceFor(wb, MARKETS.CA, { p3: usdOnly })).toBeNull();
    expect(marketPriceFor(wb, MARKETS.GB, { p3: usdOnly })).toBeNull();
  });

  it("keeps 'Price to be confirmed' for placeholders, demo titles and unknown points", () => {
    expect(marketPriceFor(wb, MARKETS.US)).toBeNull();
    expect(marketPriceFor({ pricePointId: "p3", isDemo: true }, MARKETS.US, { p3: gbpOnly })).toBeNull();
    expect(marketPriceFor({ pricePointId: "p9" }, MARKETS.US, { p3: gbpOnly })).toBeNull();
    expect(marketPriceFor({ pricePointId: null }, MARKETS.GB, { p3: gbpOnly })).toBeNull();
  });

  it("shows the interim GBP membership to readers abroad, marked as GBP", () => {
    expect(marketPriceFor({ pricePointId: "member_month" }, MARKETS.AU)).toMatchObject({ currency: "GBP", amountMinor: 799, inGbp: true });
    expect(priceFor({ pricePointId: "member_month" }, MARKETS.AU)).toBeNull();
  });

  it("has a plain note", () => {
    expect(GBP_PRICE_NOTE).toMatch(/pounds sterling \(GBP\)/);
    expect(GBP_PRICE_NOTE).not.toMatch(/—/);
  });
});
