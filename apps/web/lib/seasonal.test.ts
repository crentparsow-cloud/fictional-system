import { describe, expect, it } from "vitest";
import { cleanDay, inWindow, ukToday, windowLabel } from "./seasonal";

const NOW = new Date("2026-12-10T12:00:00Z");

describe("seasonal windows (12.5)", () => {
  it("reads today in UK time, across midnight", () => {
    expect(ukToday(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
    expect(ukToday(new Date("2026-12-10T23:30:00Z"))).toBe("2026-12-10");
  });

  it("cleans a date and refuses nonsense", () => {
    expect(cleanDay("2026-12-01")).toBe("2026-12-01");
    expect(cleanDay("2026-12-01T00:00:00Z")).toBe("2026-12-01");
    expect(cleanDay("2026-02-31")).toBeNull();
    expect(cleanDay("soon")).toBeNull();
    expect(cleanDay(null)).toBeNull();
  });

  it("shows with no dates, inside the window, and on both edge days", () => {
    expect(inWindow(null, null, NOW)).toBe(true);
    expect(inWindow("2026-12-01", "2026-12-24", NOW)).toBe(true);
    expect(inWindow("2026-12-10", "2026-12-10", NOW)).toBe(true);
    expect(inWindow("2026-12-10", null, NOW)).toBe(true);
    expect(inWindow(null, "2026-12-10", NOW)).toBe(true);
  });

  it("hides before the start and after the end", () => {
    expect(inWindow("2026-12-11", "2026-12-24", NOW)).toBe(false);
    expect(inWindow("2026-11-01", "2026-12-09", NOW)).toBe(false);
  });

  it("says the window as dates, with the year only when it is not this year", () => {
    expect(windowLabel("2026-12-01", "2026-12-24", NOW)).toBe("Shown 1 December to 24 December");
    expect(windowLabel("2026-12-01", null, NOW)).toBe("Shown from 1 December");
    expect(windowLabel(null, "2026-12-24", NOW)).toBe("Shown until 24 December");
    expect(windowLabel("2026-12-24", "2026-12-24", NOW)).toBe("Shown on 24 December");
    expect(windowLabel("2026-12-20", "2027-01-05", NOW)).toBe("Shown 20 December 2026 to 5 January 2027");
    expect(windowLabel(null, null, NOW)).toBeNull();
  });

  it("never counts down", () => {
    const label = windowLabel("2026-12-01", "2026-12-11", NOW) ?? "";
    expect(label).not.toMatch(/\bleft\b|\bremaining\b|\bhurry\b|\blast chance\b|\bends in\b|\bonly\b/i);
  });
});
