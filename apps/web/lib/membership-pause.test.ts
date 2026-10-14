import { describe, expect, it } from "vitest";
import { addMonthsUtc, canPause, pauseDateWords, pauseRefusal, pauseState, pauseWindow, pauseWindowFromMetadata, parsePauseMonths, type PauseSubject } from "./membership-pause";

const NOW = new Date("2026-10-14T09:00:00Z");
const sub = (over: Partial<PauseSubject> = {}): PauseSubject => ({
  plan: "member_month",
  status: "active",
  cancelAtPeriodEnd: false,
  cancelAt: null,
  currentPeriodEnd: "2026-11-06T09:00:00Z",
  pausedFrom: null,
  pausedUntil: null,
  ...over,
});

describe("pause date maths", () => {
  it("adds calendar months and clamps to the end of a shorter month", () => {
    expect(addMonthsUtc(new Date("2026-01-31T10:00:00Z"), 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(addMonthsUtc(new Date("2028-01-31T10:00:00Z"), 1).toISOString()).toBe("2028-02-29T10:00:00.000Z");
    expect(addMonthsUtc(new Date("2026-11-30T10:00:00Z"), 3).toISOString()).toBe("2027-02-28T10:00:00.000Z");
    expect(addMonthsUtc(new Date("2026-12-15T10:00:00Z"), 2).toISOString()).toBe("2027-02-15T10:00:00.000Z");
  });

  it("starts the pause at the end of the paid period and resumes Stripe a day before the first payment", () => {
    const w = pauseWindow(new Date("2026-11-06T09:00:00Z"), 2);
    expect(w.from.toISOString()).toBe("2026-11-06T09:00:00.000Z");
    expect(w.until.toISOString()).toBe("2027-01-06T09:00:00.000Z");
    expect(w.stripeResumesAt.toISOString()).toBe("2027-01-05T09:00:00.000Z");
  });

  it("accepts only 1, 2 or 3 months", () => {
    expect(parsePauseMonths("3")).toBe(3);
    expect(parsePauseMonths(1)).toBe(1);
    expect(parsePauseMonths("0")).toBeNull();
    expect(parsePauseMonths("4")).toBeNull();
    expect(parsePauseMonths("x")).toBeNull();
  });

  it("writes UK dates in words", () => {
    expect(pauseDateWords(new Date("2026-11-06T09:00:00Z"))).toBe("6 November 2026");
  });
});

describe("who can pause", () => {
  it("allows an active monthly membership with time left", () => {
    expect(canPause(sub(), NOW)).toBe(true);
  });
  it("refuses yearly, trial, ending, paused and past-due memberships", () => {
    expect(pauseRefusal(sub({ plan: "member_year" }), NOW)).toBe("yearly");
    expect(pauseRefusal(sub({ status: "trialing" }), NOW)).toBe("trial");
    expect(pauseRefusal(sub({ status: "past_due" }), NOW)).toBe("not_running");
    expect(pauseRefusal(sub({ cancelAtPeriodEnd: true }), NOW)).toBe("ending");
    expect(pauseRefusal(sub({ pausedFrom: "2026-10-01T00:00:00Z", pausedUntil: "2026-12-01T00:00:00Z" }), NOW)).toBe("already_paused");
    expect(pauseRefusal(sub({ currentPeriodEnd: null }), NOW)).toBe("no_period_end");
  });
});

describe("pause state", () => {
  it("is none, ahead or running, and none once it has ended", () => {
    expect(pauseState({ pausedFrom: null, pausedUntil: null }, NOW).kind).toBe("none");
    expect(pauseState({ pausedFrom: "2026-11-06T00:00:00Z", pausedUntil: "2027-01-06T00:00:00Z" }, NOW).kind).toBe("ahead");
    expect(pauseState({ pausedFrom: "2026-10-01T00:00:00Z", pausedUntil: "2026-12-01T00:00:00Z" }, NOW).kind).toBe("running");
    expect(pauseState({ pausedFrom: "2026-08-01T00:00:00Z", pausedUntil: "2026-09-01T00:00:00Z" }, NOW).kind).toBe("none");
  });
  it("reads a usable window from metadata only", () => {
    expect(pauseWindowFromMetadata({ pause_from: "2026-11-06T09:00:00Z", pause_until: "2027-01-06T09:00:00Z" })).toEqual({ from: "2026-11-06T09:00:00.000Z", until: "2027-01-06T09:00:00.000Z" });
    expect(pauseWindowFromMetadata({ pause_from: "2027-01-06T09:00:00Z", pause_until: "2026-11-06T09:00:00Z" })).toBeNull();
    expect(pauseWindowFromMetadata({ pause_from: "", pause_until: "" })).toBeNull();
    expect(pauseWindowFromMetadata(null)).toBeNull();
  });
});
