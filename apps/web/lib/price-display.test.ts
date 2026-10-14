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
  it("leads with the yearly total and puts the monthly equivalent beside it (R6)", () => {
    const line = yearlyPlanLine(yearly, uk);
    expect(line.primary).toBe("£69.99 a year");
    expect(line.secondary).toBe("£5.83 a month");
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
    expect(yearlyPlanLine(usd, us).primary).toBe("$79.99 a year");
  });

  it("the toggle component never strikes a price through and sizes both figures alike", () => {
    const src = readFileSync(fileURLToPath(new URL("../components/membership/PlanToggle.tsx", import.meta.url)), "utf8");
    expect(src).not.toMatch(/line-through|<s>|<del>|<strike|text-decoration/i);
    expect(src).toContain("plan-price-figure");
  });

  it("the yearly total is as prominent as the monthly equivalent on every surface (R6)", () => {
    const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
    // Toggle (membership offer): both figures use the one figure class, total first.
    const toggle = read("../components/membership/PlanToggle.tsx");
    expect(toggle).toMatch(/plan-price-figure">\{p\.line\.primary\}[\s\S]*plan-price-figure">\{p\.line\.secondary\}/);
    // Pricing page: two spans in one line, the same element and class.
    const page = read("../app/pricing/page.tsx");
    expect(page).toContain("<span>{c.primary}</span>");
    expect(page).toContain("<span>{c.secondary}</span>");
    const css = read("../app/globals.css");
    const planLine = css.match(/\.plan-line \{[^}]*\}/)![0];
    expect(planLine).toContain("font-size");
    expect(css).not.toMatch(/\.plan-line (span|> span)/);
    expect(css).not.toMatch(/\.plan-price-figure:(first|last|nth)/);
    // Paywall: the annual line names the total before the monthly equivalent.
    const label = read("../components/reader/paywall.ts");
    expect(label).toContain("`${line.primary}, ${line.secondary}`");
  });
});
