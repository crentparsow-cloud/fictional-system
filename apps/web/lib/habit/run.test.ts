import { describe, expect, it } from "vitest";
import { daysBetween, runLine, shouldOfferRun, summariseRun, type StepDay } from "./run";

const d = (day: string, steps = 1): StepDay => ({ day, steps });

describe("summariseRun", () => {
  it("is empty with no steps", () => {
    const s = summariseRun([], "2026-10-21", 1);
    expect(s).toMatchObject({ current: 0, longest: 0, todaySteps: 0, goalMetToday: false, resting: false });
  });

  it("counts consecutive goal days", () => {
    const s = summariseRun([d("2026-10-19"), d("2026-10-20"), d("2026-10-21")], "2026-10-21", 1);
    expect(s).toMatchObject({ current: 3, longest: 3, goalMetToday: true, resting: false });
  });

  it("holds the run through a pause within the allowance", () => {
    // Two quiet days between the 18th and the 21st.
    const s = summariseRun([d("2026-10-17"), d("2026-10-18"), d("2026-10-21")], "2026-10-21", 1, 3);
    expect(s.current).toBe(3);
  });

  it("does not add the paused days to the count", () => {
    const s = summariseRun([d("2026-10-10"), d("2026-10-14")], "2026-10-14", 1, 3);
    expect(s.current).toBe(2);
  });

  it("ends the run after a gap longer than the allowance and keeps the longest", () => {
    const days = [d("2026-10-01"), d("2026-10-02"), d("2026-10-03"), d("2026-10-04"), d("2026-10-20")];
    const s = summariseRun(days, "2026-10-21", 1, 3);
    expect(s.longest).toBe(4);
    expect(s.current).toBe(1);
  });

  it("shows no current run when the last goal day is beyond the allowance, but keeps the longest", () => {
    const s = summariseRun([d("2026-10-01"), d("2026-10-02")], "2026-10-21", 1, 3);
    expect(s.current).toBe(0);
    expect(s.longest).toBe(2);
  });

  it("treats a gap of exactly the allowance as a pause and one day more as the end", () => {
    // 4th and 8th: three days between.
    expect(summariseRun([d("2026-10-04"), d("2026-10-08")], "2026-10-08", 1, 3).current).toBe(2);
    expect(summariseRun([d("2026-10-04"), d("2026-10-09")], "2026-10-09", 1, 3).current).toBe(1);
  });

  it("keeps the run alive today while the reader has not yet finished a step", () => {
    const s = summariseRun([d("2026-10-19"), d("2026-10-20")], "2026-10-21", 1);
    expect(s).toMatchObject({ current: 2, goalMetToday: false, resting: true });
  });

  it("needs the daily goal for a goal day", () => {
    const days = [d("2026-10-19", 1), d("2026-10-20", 2), d("2026-10-21", 2)];
    const s = summariseRun(days, "2026-10-21", 2);
    expect(s.current).toBe(2);
    expect(s.todaySteps).toBe(2);
    expect(summariseRun([d("2026-10-21", 1)], "2026-10-21", 2).goalMetToday).toBe(false);
  });

  it("ignores days in the future", () => {
    expect(summariseRun([d("2026-10-25")], "2026-10-21", 1).longest).toBe(0);
  });

  it("works across a month and a year end", () => {
    const s = summariseRun([d("2026-12-30"), d("2026-12-31"), d("2027-01-01")], "2027-01-01", 1);
    expect(s.current).toBe(3);
    expect(daysBetween("2026-12-31", "2027-01-02")).toBe(2);
  });
});

describe("shouldOfferRun", () => {
  const base = { eligibleSteps: 3, offerAfter: 3, runOn: false, declined: false };
  it("offers after the third finished step", () => {
    expect(shouldOfferRun(base)).toBe(true);
    expect(shouldOfferRun({ ...base, eligibleSteps: 2 })).toBe(false);
  });
  it("does not offer when it is on, or after the reader said not now", () => {
    expect(shouldOfferRun({ ...base, runOn: true })).toBe(false);
    expect(shouldOfferRun({ ...base, declined: true })).toBe(false);
  });
});

describe("runLine", () => {
  it("never mentions anything missed", () => {
    const lines = [
      runLine(summariseRun([], "2026-10-21", 1)),
      runLine(summariseRun([d("2026-10-01")], "2026-10-21", 1)),
      runLine(summariseRun([d("2026-10-20")], "2026-10-21", 2)),
      runLine(summariseRun([d("2026-10-21")], "2026-10-21", 1)),
    ];
    for (const l of lines) expect(l).not.toMatch(/miss|behind|lost|break|broke|streak/i);
  });
});
