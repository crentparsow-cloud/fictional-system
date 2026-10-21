import { describe, expect, it } from "vitest";
import { PAYMENT_MARK, trustItems } from "./trust-strip";

describe("trust strip", () => {
  it("says the four plain things for a membership", () => {
    const text = trustItems("membership").map((i) => i.text).join(" ");
    expect(text).toMatch(/sealed/);
    expect(text).toMatch(/No trackers/);
    expect(text).toMatch(/Your 14-day cancellation right under UK law/);
    expect(text).toMatch(/Cancel in two taps/);
  });
  it("does not sell the legal right as a gift, and is honest that it ends for a workbook", () => {
    const wb = trustItems("workbook").map((i) => i.text).join(" ");
    expect(wb).toMatch(/ends when access starts/);
    expect(wb).not.toMatch(/guarantee|free/i);
    expect(trustItems("workbook").some((i) => i.id === "cancel")).toBe(false);
  });
  it("uses no em dash and no image", () => {
    expect(JSON.stringify(trustItems("both")) + PAYMENT_MARK).not.toMatch(/—|<img|https?:/);
  });
});
