import { describe, expect, it } from "vitest";
import { bundleAmount, bundleCheckoutParams, bundleLines, bundleOffer } from "./bundle";

const titles = [
  { id: "w1", priceMinor: 1500 },
  { id: "w2", priceMinor: 1500 },
  { id: "w3", priceMinor: 1200 },
];

describe("bundle amount", () => {
  it("reads the pound figure", () => {
    expect(bundleAmount({ GBP: 3000 })).toBe(3000);
  });
  it("rejects anything that is not a positive whole number", () => {
    expect(bundleAmount({ GBP: 0 })).toBeNull();
    expect(bundleAmount({ GBP: 12.5 })).toBeNull();
    expect(bundleAmount({ USD: 3000 })).toBeNull();
    expect(bundleAmount(null)).toBeNull();
    expect(bundleAmount("x")).toBeNull();
  });
});

describe("bundle offer", () => {
  it("works out both prices and the saving", () => {
    const o = bundleOffer({ titles, bundleMinor: 3000, ownedIds: [] });
    expect(o).toMatchObject({ titleCount: 3, bundleMinor: 3000, singlesMinor: 4200, savingMinor: 1200, workbookIds: ["w1", "w2", "w3"] });
    expect(o?.bundlePrice).toBe("£30.00");
    expect(o?.singlesPrice).toBe("£42.00");
    expect(o?.savingPrice).toBe("£12.00");
  });
  it("is not offered to someone who owns any of the titles", () => {
    expect(bundleOffer({ titles, bundleMinor: 3000, ownedIds: ["w2"] })).toBeNull();
  });
  it("is not offered with fewer than two titles", () => {
    expect(bundleOffer({ titles: titles.slice(0, 1), bundleMinor: 1000, ownedIds: [] })).toBeNull();
  });
  it("is not offered when a title has no price", () => {
    expect(bundleOffer({ titles: [...titles, { id: "w4", priceMinor: 0 }], bundleMinor: 3000, ownedIds: [] })).toBeNull();
  });
  it("is not offered when there is no bundle price", () => {
    expect(bundleOffer({ titles, bundleMinor: null, ownedIds: [] })).toBeNull();
  });
  it("is not offered when it is not cheaper", () => {
    expect(bundleOffer({ titles, bundleMinor: 4200, ownedIds: [] })).toBeNull();
    expect(bundleOffer({ titles, bundleMinor: 5000, ownedIds: [] })).toBeNull();
  });
});

describe("bundle wording", () => {
  it("shows both prices as plain lines, with no strike-through", () => {
    const o = bundleOffer({ titles, bundleMinor: 3000, ownedIds: [] })!;
    const l = bundleLines(o);
    expect(l.bundle).toBe("Together: £30.00");
    expect(l.singles).toBe("One at a time: £42.00");
    const all = Object.values(l).join(" ");
    expect(all).not.toMatch(/<s>|<del>|line-through|free|—/i);
  });
});

describe("bundle checkout", () => {
  it("is a one-off payment that names the Theme and a count, never a title", () => {
    const p = bundleCheckoutParams({
      themeId: "sleep",
      themeName: "Sleep",
      titleCount: 3,
      bundleMinor: 3000,
      currency: "GBP",
      userId: "u1",
      tenantId: "t1",
      buyerEmail: "a@b.test",
      consentMeta: { consent_id: "7" },
      successUrl: "https://x/themes/sleep?bundle=paid",
      cancelUrl: "https://x/themes/sleep",
    });
    expect(p.mode).toBe("payment");
    expect(p.metadata).toMatchObject({ kind: "bundle", theme_id: "sleep", titles: "3", consent_id: "7" });
    const item = p.line_items?.[0] as { price_data: { unit_amount: number; currency: string; product_data: { description: string } } };
    expect(item.price_data.unit_amount).toBe(3000);
    expect(item.price_data.currency).toBe("gbp");
    expect(item.price_data.product_data.description).toBe("Sleep: 3 workbooks");
  });
});
