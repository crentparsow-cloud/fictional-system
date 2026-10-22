import { describe, expect, it } from "vitest";
import { localMidnightUtc, monthStartDate, monthStartUtc, nextDate, tzOffsetMs } from "./time";

describe("tzOffsetMs", () => {
  it("is zero for UTC and follows the clocks in London", () => {
    expect(tzOffsetMs(new Date("2026-01-15T12:00:00Z"), "UTC")).toBe(0);
    expect(tzOffsetMs(new Date("2026-01-15T12:00:00Z"), "Europe/London")).toBe(0);
    expect(tzOffsetMs(new Date("2026-07-15T12:00:00Z"), "Europe/London")).toBe(3_600_000);
    expect(tzOffsetMs(new Date("2026-07-15T12:00:00Z"), "America/New_York")).toBe(-4 * 3_600_000);
  });
});

describe("localMidnightUtc", () => {
  it("is the start of the local day", () => {
    expect(localMidnightUtc("2026-07-01", "Europe/London").toISOString()).toBe("2026-06-30T23:00:00.000Z");
    expect(localMidnightUtc("2026-01-01", "Europe/London").toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(localMidnightUtc("2026-10-01", "Australia/Sydney").toISOString()).toBe("2026-09-30T14:00:00.000Z");
  });

  it("handles the day the clocks change", () => {
    // Clocks go forward on 29 March 2026 and back on 25 October 2026.
    expect(localMidnightUtc("2026-03-29", "Europe/London").toISOString()).toBe("2026-03-29T00:00:00.000Z");
    expect(localMidnightUtc("2026-03-30", "Europe/London").toISOString()).toBe("2026-03-29T23:00:00.000Z");
    expect(localMidnightUtc("2026-10-25", "Europe/London").toISOString()).toBe("2026-10-24T23:00:00.000Z");
    expect(localMidnightUtc("2026-10-26", "Europe/London").toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });
});

describe("month start", () => {
  it("uses the reader's zone, not UTC", () => {
    // 00:30 on 1 November in London is still 31 October in New York.
    const at = new Date("2026-11-01T00:30:00Z");
    expect(monthStartDate(at, "Europe/London")).toBe("2026-11-01");
    expect(monthStartDate(at, "America/New_York")).toBe("2026-10-01");
    expect(monthStartUtc(at, "Europe/London").toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
});

describe("nextDate", () => {
  it("rolls over months and years", () => {
    expect(nextDate("2026-10-31")).toBe("2026-11-01");
    expect(nextDate("2026-12-31")).toBe("2027-01-01");
    expect(nextDate("2028-02-28")).toBe("2028-02-29");
  });
});
