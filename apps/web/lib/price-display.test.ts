import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { marketFor } from "@/lib/markets";
import { monthlyEquivalentMinor, monthlyPlanLine, yearlyPlanLine } from "@/lib/price-display";
import type { Price } from "@/lib/pricing";

const uk = marketFor("GB");
const monthly: Price = { pointId: "member_month", currency: "GBP", amountMinor: 799, formatted: "£7.99" };
const yearly: Price = { pointId: "member_year", currency: "GBP", amountMinor: 6999, formatted: "£69.99" };

describe("annual price display (14.21)", () => {
  it("shows the monthly equivalent with the yearly total beside it", () => {
    const line = yearlyPlanLine(yearly, uk);
    expect(line.primary).toBe("£5.83 a month");
    expect(line.secondary).toBe("£69.99 a year");
    expect(line.billing).toContain("£69.99 once a year");
  });

  it("rounds the equivalent to the nearest penny", () => {
    expect(monthlyEquivalentMinor(6999)).toBe(583);
    expect(monthlyEquivalentMinor(6000)).toBe(500);
    expect(monthlyEquivalentMinor(7001)).toBe(583);
    expect(monthlyEquivalentMinor(7006)).toBe(584);
  });

  it("shows the monthly plan as one price with no second figure", () => {
    const line = monthlyPlanLine(monthly, uk);
    expect(line.primary).toBe("£7.99 a month");
    expect(line.secondary).toBeNull();
  });

  it("carries no 'was' figure, saving claim or countdown", () => {
    const text = JSON.stringify([yearlyPlanLine(yearly, uk), monthlyPlanLine(monthly, uk)]);
    expect(text).not.toMatch(/was|save|saving|off\b|only today|ends|hurry|countdown|free/i);
    expect(Object.keys(yearlyPlanLine(yearly, uk)).sort()).toEqual(["billing", "plan", "primary", "secondary"]);
  });

  it("is formatted in the market's currency symbol", () => {
    const us = marketFor("US");
    const usd: Price = { pointId: "member_year", currency: "USD", amountMinor: 7999, formatted: "$79.99" };
    expect(yearlyPlanLine(usd, us).secondary).toBe("$79.99 a year");
  });

  it("the toggle component never strikes a price through and sizes both figures alike", () => {
    const src = readFileSync(fileURLToPath(new URL("../components/membership/PlanToggle.tsx", import.meta.url)), "utf8");
    expect(src).not.toMatch(/line-through|<s>|<del>|<strike|text-decoration/i);
    expect(src).toContain("plan-price-figure");
  });
});
