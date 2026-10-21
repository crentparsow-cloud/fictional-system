import { describe, expect, it } from "vitest";
import { FAQ, WHICH_TO_PICK, planCards, type PricingInput } from "./pricing-page";

const row = (id: string, gbp: number) => ({ id, kind: "membership", amounts: { GBP: gbp }, stripe_price_id: "price_x", active: true });
const ROWS = [row("member_month", 799), row("member_year", 6999), row("member_two_month", 1199), row("member_two_year", 10499)];
const input = (over: Partial<PricingInput> = {}): PricingInput => ({
  rows: ROWS,
  trial: { monthly: 0, yearly: 0 },
  sharedOpen: true,
  sharedYearlyOpen: true,
  open: { monthly: true, yearly: true },
  ...over,
});
const allText = (over?: Partial<PricingInput>) => JSON.stringify(planCards(input(over))) + JSON.stringify(FAQ) + JSON.stringify(WHICH_TO_PICK);

describe("plan cards", () => {
  it("puts the recommended annual plan first with a badge", () => {
    const cards = planCards(input());
    expect(cards[0]?.id).toBe("annual");
    expect(cards[0]?.badge).toBe("Recommended");
    expect(cards.filter((c) => c.badge)).toHaveLength(1);
  });

  it("shows the annual plan with the yearly total first and the monthly equivalent beside it", () => {
    const annual = planCards(input()).find((c) => c.id === "annual")!;
    expect(annual.primary).toBe("£69.99 a year");
    expect(annual.secondary).toBe("£5.83 a month");
    expect(annual.billing).toMatch(/£69\.99 once a year/);
  });

  it("shows the two-person plans at the decided prices, the annual one with its total and monthly figure", () => {
    const cards = planCards(input());
    const monthly = cards.find((c) => c.id === "two")!;
    expect(monthly.primary).toBe("£11.99 a month");
    expect(monthly.checkout).toBe("two_monthly");
    const annual = cards.find((c) => c.id === "two_annual")!;
    expect(annual.primary).toBe("£104.99 a year");
    expect(annual.secondary).toBe("£8.75 a month");
    expect(annual.checkout).toBe("two_yearly");
    // no trial on either two-person plan, whatever the trial settings say
    const withTrial = planCards(input({ trial: { monthly: 14, yearly: 21 } }));
    for (const id of ["two", "two_annual"]) expect(withTrial.find((c) => c.id === id)!.terms.join(" ")).not.toMatch(/trial/i);
  });

  it("leaves out the annual two-person card until it can be bought", () => {
    expect(planCards(input({ sharedYearlyOpen: false })).some((c) => c.id === "two_annual")).toBe(false);
    expect(planCards(input({ rows: ROWS.filter((r) => r.id !== "member_two_year") })).some((c) => c.id === "two_annual")).toBe(false);
  });

  it("recommends the monthly plan when no annual price is set", () => {
    const cards = planCards(input({ rows: [row("member_month", 799)] }));
    expect(cards[0]?.id).toBe("monthly");
    expect(cards[0]?.badge).toBe("Recommended");
  });

  it("leaves out the two-person card until it can be bought, and never invents a price", () => {
    expect(planCards(input({ sharedOpen: false })).some((c) => c.id === "two")).toBe(false);
    expect(planCards(input({ rows: [] })).map((c) => c.id)).toEqual(["workbook"]);
    expect(planCards(input({ rows: [] }))[0]?.badge).toBeNull();
  });

  it("lists the workbook card last", () => {
    const ids = planCards(input()).map((c) => c.id);
    expect(ids[ids.length - 1]).toBe("workbook");
  });

  it("uses no strike-through, was, save, per-day sums or false free", () => {
    const text = allText({ trial: { monthly: 7, yearly: 7 } });
    expect(text).not.toMatch(/<s>|<del>|line-through|\bwas\b|\bsave\b|saving|per day|a day\b|each day/i);
    expect(text).not.toMatch(/—/);
    // "free" appears only as Week 1 or the first week of a workbook, and never about a trial or membership.
    for (const m of text.matchAll(/[^."]{0,40}\bfree\b[^."]{0,30}/gi)) expect(m[0]).toMatch(/Week 1 is free, no card|first week of any workbook is free|free to read|Is there a free week|free week/i);
    expect(text).toMatch(/Week 1 is free, no card/);
  });

  it("describes a trial by length and what follows", () => {
    const monthly = planCards(input({ trial: { monthly: 7, yearly: 0 } })).find((c) => c.id === "monthly")!;
    expect(monthly.terms.join(" ")).toMatch(/trial/i);
    const none = planCards(input()).find((c) => c.id === "monthly")!;
    expect(none.terms.join(" ")).not.toMatch(/trial/i);
  });

  it("keeps price, renewal, refund and cancel steps together on every membership card", () => {
    for (const c of planCards(input()).filter((c) => c.id !== "workbook")) {
      expect(c.terms.join(" ")).toMatch(/Renews/);
      expect(c.terms.join(" ")).toMatch(/14 days/);
      expect(c.terms.join(" ")).toMatch(/Cancel in two taps: You, then Cancel membership/);
    }
  });

  it("answers Can I cancel with the real steps", () => {
    const a = FAQ.find((f) => f.q === "Can I cancel?")!.a;
    expect(a).toMatch(/You, then Cancel membership/);
    expect(a).toMatch(/do not have to give a reason/);
  });
});
