import { describe, expect, it } from "vitest";
import { COHORT_FLAGS, flagBucket, flagOn, isCohortFlag, parsePercent, rolloutLine } from "@/lib/platform/flags";

describe("flagBucket", () => {
  it("matches the database function for pinned pairs (supabase/tests/0064)", () => {
    expect(flagBucket("00000000-0000-0000-0000-000000000001", "web_push")).toBe(99);
    // First four bytes 3293017423: the unsigned read matters.
    expect(flagBucket("00000000-0000-0000-0000-000000000002", "web_push")).toBe(23);
  });
  it("is stable and in range", () => {
    const id = "a6400000-0000-0000-0000-000000000002";
    expect(flagBucket(id, "web_push")).toBe(flagBucket(id, "web_push"));
    for (let i = 0; i < 200; i++) {
      const b = flagBucket(`00000000-0000-0000-0000-${String(i).padStart(12, "0")}`, "programme_friends");
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(100);
    }
  });
  it("spreads readers roughly evenly", () => {
    let inside = 0;
    for (let i = 0; i < 2000; i++) if (flagOn({ enabled: true, rolloutPercent: 25 }, "web_push", `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`)) inside++;
    expect(inside).toBeGreaterThan(400);
    expect(inside).toBeLessThan(600);
  });
});

describe("flagOn", () => {
  const id = "00000000-0000-0000-0000-000000000001"; // bucket 99 for web_push
  it("is off with no row, or switched off", () => {
    expect(flagOn(null, "web_push", id)).toBe(false);
    expect(flagOn({ enabled: false, rolloutPercent: 100 }, "web_push", id)).toBe(false);
  });
  it("is on for everyone at 100, including signed out", () => {
    expect(flagOn({ enabled: true, rolloutPercent: 100 }, "web_push", id)).toBe(true);
    expect(flagOn({ enabled: true, rolloutPercent: 100 }, "web_push", null)).toBe(true);
  });
  it("is off at 0 and for signed-out visitors below 100", () => {
    expect(flagOn({ enabled: true, rolloutPercent: 0 }, "web_push", id)).toBe(false);
    expect(flagOn({ enabled: true, rolloutPercent: 50 }, "web_push", null)).toBe(false);
  });
  it("only ever adds readers as the percentage rises", () => {
    const user = "00000000-0000-0000-0000-000000000002"; // bucket 23
    let prev = false;
    for (let p = 0; p <= 100; p++) {
      const now = flagOn({ enabled: true, rolloutPercent: p }, "web_push", user);
      if (prev) expect(now).toBe(true);
      prev = now;
    }
    expect(flagOn({ enabled: true, rolloutPercent: 23 }, "web_push", user)).toBe(false);
    expect(flagOn({ enabled: true, rolloutPercent: 24 }, "web_push", user)).toBe(true);
  });
});

describe("helpers", () => {
  it("knows its flags", () => {
    expect(COHORT_FLAGS.every(isCohortFlag)).toBe(true);
    expect(isCohortFlag("live_payments")).toBe(false);
    expect(isCohortFlag(7)).toBe(false);
  });
  it("parses a percentage", () => {
    expect(parsePercent("0")).toBe(0);
    expect(parsePercent(" 40 ")).toBe(40);
    expect(parsePercent("100")).toBe(100);
    expect(parsePercent("101")).toBeNull();
    expect(parsePercent("-1")).toBeNull();
    expect(parsePercent("4.5")).toBeNull();
    expect(parsePercent(null)).toBeNull();
  });
  it("says who is in", () => {
    expect(rolloutLine({ enabled: false, rolloutPercent: 50 })).toBe("Off for everyone.");
    expect(rolloutLine({ enabled: true, rolloutPercent: 100 })).toBe("On for everyone.");
    expect(rolloutLine({ enabled: true, rolloutPercent: 20 })).toContain("20 percent");
  });
});
