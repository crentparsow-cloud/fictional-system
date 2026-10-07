import { describe, expect, it } from "vitest";
import { PRICE_TO_BE_CONFIRMED } from "./pricing";
import { ENQUIRY_HREF, membershipDisplay, organisationPrivacyLine } from "./plans";

const row = (id: string, amounts: unknown, active = true) => ({ id, kind: "membership", amounts, stripe_price_id: null, active });

describe("plans and pricing pages (F-009, F-206)", () => {
  it("shows the membership prices that are in price_points", () => {
    const m = membershipDisplay([row("member_month", { GBP: 799 }), row("member_year", { GBP: 6999 })]);
    expect(m.monthly).toMatch(/^£7\.99 a month$/);
    expect(m.yearly).toMatch(/^£69\.99 a year$/);
    expect(m.hasPrice).toBe(true);
  });

  it("never invents a figure: missing, inactive or empty rows say to be confirmed", () => {
    expect(membershipDisplay(null)).toEqual({ monthly: PRICE_TO_BE_CONFIRMED, yearly: PRICE_TO_BE_CONFIRMED, hasPrice: false });
    expect(membershipDisplay([row("member_month", {})]).monthly).toBe(PRICE_TO_BE_CONFIRMED);
    expect(membershipDisplay([row("member_month", { GBP: 799 }, false)]).monthly).toBe(PRICE_TO_BE_CONFIRMED);
    expect(membershipDisplay([row("member_month", { USD: 999 })]).monthly).toBe(PRICE_TO_BE_CONFIRMED);
    expect(membershipDisplay([{ ...row("member_month", { GBP: 799 }), kind: "workbook" }]).monthly).toBe(PRICE_TO_BE_CONFIRMED);
  });

  it("sends every talk-to-us button to the existing enquiry form", () => {
    expect(ENQUIRY_HREF).toBe("/publish#enquiry");
  });

  it("states the privacy line with the brand name and no church claim", () => {
    const line = organisationPrivacyLine("Akana");
    expect(line).toContain("never who wrote what");
    expect(line).toContain("Akana staff");
    expect(line).not.toMatch(/church/i);
  });
});
