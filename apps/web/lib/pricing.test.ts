import { describe, expect, it } from "vitest";
import { MARKETS } from "@/lib/markets";
import {
  PRICE_LADDER,
  PRICE_POINT_IDS,
  PRICE_TO_BE_CONFIRMED,
  amountFor,
  formatPrice,
  isPlaceholder,
  isPricePointId,
  priceCurrencyFor,
  priceFor,
  pricePointFromRow,
  type PricePoint,
} from "@/lib/pricing";

const setPoint: PricePoint = {
  id: "p2",
  kind: "workbook",
  label: "Ladder point 2",
  amounts: { GBP: 1200, EUR: 1400, USD: 1500 },
  stripePriceId: "price_test",
  active: true,
};

describe("the ladder", () => {
  it("mirrors the eight price_points rows and every one is a placeholder", () => {
    expect(PRICE_POINT_IDS).toEqual(["p1", "p2", "p3", "p4", "p5", "p6", "member_month", "member_year"]);
    for (const id of PRICE_POINT_IDS) {
      expect(isPlaceholder(PRICE_LADDER[id])).toBe(true);
      expect(PRICE_LADDER[id].active).toBe(false);
      expect(PRICE_LADDER[id].stripePriceId).toBeNull();
    }
    expect(PRICE_LADDER.member_month.kind).toBe("membership");
    expect(PRICE_LADDER.p1.kind).toBe("workbook");
  });

  it("knows its ids", () => {
    expect(isPricePointId("p3")).toBe(true);
    expect(isPricePointId("member_year")).toBe(true);
    expect(isPricePointId("p7")).toBe(false);
    expect(isPricePointId(null)).toBe(false);
  });

  it("maps a market to its ladder currency", () => {
    expect(priceCurrencyFor(MARKETS.GB)).toBe("GBP");
    expect(priceCurrencyFor(MARKETS.IE)).toBe("EUR");
    expect(priceCurrencyFor(MARKETS.XX)).toBe("USD");
  });
});

describe("priceFor", () => {
  it("returns null while the amounts are placeholders so pages show the holding line", () => {
    expect(priceFor({ pricePointId: "p2" }, MARKETS.GB)).toBeNull();
    expect(PRICE_TO_BE_CONFIRMED).toBe("Price to be confirmed");
  });

  it("returns null for a workbook with no point, an unknown point or a demo title", () => {
    expect(priceFor({ pricePointId: null }, MARKETS.GB)).toBeNull();
    expect(priceFor({ pricePointId: "p9" }, MARKETS.GB)).toBeNull();
    expect(priceFor({ pricePointId: "p2", isDemo: true }, MARKETS.GB, { p2: setPoint })).toBeNull();
  });

  it("prices a set point in the market currency and never falls back to GBP", () => {
    const gb = priceFor({ pricePointId: "p2" }, MARKETS.GB, { p2: setPoint });
    expect(gb).toEqual({ pointId: "p2", currency: "GBP", amountMinor: 1200, formatted: "£12.00" });
    const ie = priceFor({ pricePointId: "p2" }, MARKETS.IE, { p2: setPoint });
    expect(ie?.currency).toBe("EUR");
    expect(ie?.amountMinor).toBe(1400);
    // no AUD set on this point: nothing shown rather than a GBP figure
    expect(priceFor({ pricePointId: "p2" }, MARKETS.AU, { p2: setPoint })).toBeNull();
  });
});

describe("amountFor and formatPrice", () => {
  it("formats minor units in the market locale", () => {
    expect(formatPrice(1200, MARKETS.GB)).toBe("£12.00");
    expect(formatPrice(1500, MARKETS.US)).toBe("$15.00");
  });

  it("rejects zero, negative and fractional amounts", () => {
    const bad: PricePoint = { ...setPoint, amounts: { GBP: 0, USD: -5, EUR: 12.5 } };
    expect(isPlaceholder(bad)).toBe(true);
    expect(amountFor(bad, MARKETS.GB)).toBeNull();
  });
});

describe("pricePointFromRow", () => {
  it("builds a point from a database row and keeps only valid currency amounts", () => {
    const p = pricePointFromRow({ id: "p4", kind: "workbook", amounts: { GBP: 1800, XYZ: 1, USD: "20" }, stripe_price_id: "price_1", active: true });
    expect(p?.amounts).toEqual({ GBP: 1800 });
    expect(p?.stripePriceId).toBe("price_1");
    expect(p?.active).toBe(true);
    expect(isPlaceholder(p)).toBe(false);
  });

  it("treats the seeded empty row as a placeholder and drops unknown ids", () => {
    const p = pricePointFromRow({ id: "p1", kind: "workbook", amounts: {}, stripe_price_id: null, active: false });
    expect(isPlaceholder(p)).toBe(true);
    expect(pricePointFromRow({ id: "p0", kind: "workbook", amounts: {}, stripe_price_id: null, active: false })).toBeNull();
    expect(pricePointFromRow({ id: "p1", kind: "bundle", amounts: {}, stripe_price_id: null, active: false })).toBeNull();
  });
});
