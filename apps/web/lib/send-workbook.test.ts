import { describe, expect, it } from "vitest";
import {
  GIFT_CLAIM_MESSAGES,
  GIFT_RULES,
  GIFT_SEND_MESSAGES,
  cleanGiftEmail,
  giftQuarter,
  giftUrl,
  isGiftClaimResult,
  isGiftSendStatus,
  isGiftToken,
  longDateGB,
  nextQuarterLabel,
  nextQuarterStart,
} from "./send-workbook";

describe("quarters", () => {
  it("works in London time", () => {
    expect(giftQuarter(new Date("2026-01-01T00:00:00Z"))).toBe("2026-Q1");
    expect(giftQuarter(new Date("2026-03-31T22:59:00Z"))).toBe("2026-Q1");
    // 23:30 UTC on 31 March is 00:30 BST on 1 April
    expect(giftQuarter(new Date("2026-03-31T23:30:00Z"))).toBe("2026-Q2");
    expect(giftQuarter(new Date("2026-10-21T10:00:00Z"))).toBe("2026-Q4");
    expect(giftQuarter(new Date("2026-12-31T23:59:00Z"))).toBe("2026-Q4");
    expect(giftQuarter(new Date("2027-01-01T00:00:00Z"))).toBe("2027-Q1");
  });
  it("names the next quarter's first day", () => {
    expect(nextQuarterStart("2026-Q4")).toEqual({ year: 2027, month: 1 });
    expect(nextQuarterStart("2026-Q1")).toEqual({ year: 2026, month: 4 });
    expect(nextQuarterLabel("2026-Q2")).toBe("1 July 2026");
    expect(() => nextQuarterStart("2026-Q5")).toThrow();
  });
});

describe("input", () => {
  it("tidies an address and refuses nonsense", () => {
    expect(cleanGiftEmail("  Friend@Example.ORG ")).toBe("friend@example.org");
    expect(cleanGiftEmail("no-at")).toBeNull();
    expect(cleanGiftEmail("a@b")).toBeNull();
    expect(cleanGiftEmail(42)).toBeNull();
    expect(cleanGiftEmail(`${"a".repeat(250)}@x.org`)).toBeNull();
  });
  it("recognises a 32 character token only", () => {
    expect(isGiftToken("A".repeat(32))).toBe(true);
    expect(isGiftToken("A".repeat(31))).toBe(false);
    expect(isGiftToken("../".repeat(11))).toBe(false);
  });
  it("puts the token in the path", () => {
    expect(giftUrl("https://akana.example/", "T".repeat(32))).toBe(`https://akana.example/send/${"T".repeat(32)}`);
  });
  it("writes the date in full", () => {
    expect(longDateGB(new Date("2026-11-20T12:00:00Z"))).toBe("20 November 2026");
  });
});

describe("words", () => {
  it("has a message for every outcome the database returns", () => {
    for (const s of ["sent", "not_member", "used_this_quarter", "not_giftable", "not_eligible", "waiting"]) expect(isGiftSendStatus(s)).toBe(true);
    for (const s of ["claimed", "unchanged", "unknown", "expired", "not_available", "not_eligible"]) expect(isGiftClaimResult(s)).toBe(true);
    expect(isGiftSendStatus("other")).toBe(false);
    expect(Object.keys(GIFT_SEND_MESSAGES)).toHaveLength(6);
    expect(Object.keys(GIFT_CLAIM_MESSAGES)).toHaveLength(6);
  });
  it("keeps to the house rules: no em dashes, no free, no card needed stated", () => {
    const all = [...GIFT_RULES, ...Object.values(GIFT_SEND_MESSAGES), ...Object.values(GIFT_CLAIM_MESSAGES)].join(" ");
    expect(all).not.toMatch(/—|\bfree\b/i);
    expect(GIFT_RULES.join(" ")).toMatch(/need no card/);
    expect(GIFT_RULES.join(" ")).toMatch(/does not roll over/);
  });
});
