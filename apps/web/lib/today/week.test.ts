import { describe, expect, it } from "vitest";
import * as weekModule from "@/lib/today/week";
import { answered, step } from "@/lib/today/fixtures";
import { countedFinishes, rhythmLine, rhythmUnit, thisWeekMarked, weekKey, weekMarks } from "@/lib/today/week";

describe("weekKey", () => {
  it("starts the week on Monday", () => {
    expect(weekKey(new Date("2026-10-04T12:00:00Z"))).toBe("2026-W40"); // Sunday
    expect(weekKey(new Date("2026-10-05T00:30:00Z"))).toBe("2026-W41"); // Monday
    expect(weekKey(new Date("2026-10-11T22:00:00Z"))).toBe("2026-W41"); // Sunday evening
  });
  it("handles the turn of the year the ISO way", () => {
    expect(weekKey(new Date("2026-12-31T12:00:00Z"))).toBe("2026-W53");
    expect(weekKey(new Date("2027-01-03T12:00:00Z"))).toBe("2026-W53");
    expect(weekKey(new Date("2027-01-04T12:00:00Z"))).toBe("2027-W01");
  });
  it("follows the reader's own day", () => {
    // 22:30 UTC on Sunday is 23:30 Sunday in London and already Monday in Auckland.
    const at = new Date("2026-10-04T22:30:00Z");
    expect(weekKey(at, "Europe/London")).toBe("2026-W40");
    expect(weekKey(at, "Pacific/Auckland")).toBe("2026-W41");
  });
});

describe("what counts toward a week", () => {
  const steps = [step(1, "a"), step(1, "b", { indexInUnit: 1, countInUnit: 2 }), step(2, "c")];
  const events = [
    { kind: "step_done", ref: "a", at: "2026-10-06T10:00:00Z" },
    { kind: "step_done", ref: "b", at: "2026-10-14T10:00:00Z" },
    { kind: "step_done", ref: "a~r", at: "2026-10-20T10:00:00Z" },
    { kind: "checkin_done", ref: "1", at: "2026-10-21T10:00:00Z" },
    { kind: "toolkit_used", ref: "c", at: "2026-10-22T10:00:00Z" },
    { kind: "unit_opened", ref: "2", at: "2026-10-23T10:00:00Z" },
    { kind: "step_done", ref: "unknown", at: "2026-10-27T10:00:00Z" },
  ];

  it("counts a finished step only when its fields are filled", () => {
    const filled = countedFinishes(steps, events, answered("a.what", "b.what"));
    expect(filled.map((f) => f.exerciseId)).toEqual(["a", "b"]);
    const onlyA = countedFinishes(steps, events, answered("a.what"));
    expect(onlyA.map((f) => f.exerciseId)).toEqual(["a"]);
    expect(countedFinishes(steps, events, answered())).toEqual([]);
  });

  it("marks the calendar weeks with a counted step, and no other week", () => {
    const marks = weekMarks(countedFinishes(steps, events, answered("a.what", "b.what")));
    expect([...marks].sort()).toEqual(["2026-W41", "2026-W42"]);
  });

  it("answers only whether this week is marked, never how many in a row", () => {
    const finishes = countedFinishes(steps, events, answered("a.what", "b.what"));
    expect(thisWeekMarked(finishes, new Date("2026-10-08T12:00:00Z"))).toBe(true);
    expect(thisWeekMarked(finishes, new Date("2026-10-20T12:00:00Z"))).toBe(false);
  });

  it("offers no streak, run or total of weeks", () => {
    const names = Object.keys(weekModule).join(" ").toLowerCase();
    expect(names).not.toMatch(/streak|longest|consecutive|total/);
  });
});

describe("rhythmLine", () => {
  it("says the week and the steps in plain words", () => {
    expect(rhythmLine({ unitWord: "week", unit: 3, unitCount: 8, stepsInUnit: 2 })).toBe("Week 3 of 8. Two steps this week.");
    expect(rhythmLine({ unitWord: "week", unit: 1, unitCount: 4, stepsInUnit: 1 })).toBe("Week 1 of 4. One step this week.");
  });
  it("follows the programme's own unit word", () => {
    expect(rhythmLine({ unitWord: "day", unit: 3, unitCount: 21, stepsInUnit: 1 })).toBe("Day 3 of 21. One step today.");
    expect(rhythmLine({ unitWord: "module", unit: 2, unitCount: 6, stepsInUnit: 3 })).toBe("Module 2 of 6. Three steps in this module.");
  });
  it("leaves out the total when it is not known", () => {
    expect(rhythmLine({ unitWord: "week", unit: 3, unitCount: null, stepsInUnit: 2 })).toBe("Week 3. Two steps this week.");
  });
});

describe("rhythmUnit", () => {
  const steps = [step(1, "a", { countInUnit: 2 }), step(2, "b", { countInUnit: 3 })];
  it("points at the unit of the next step, or the last unit when all are done", () => {
    expect(rhythmUnit(steps, steps[1] ?? null)).toEqual({ unit: 2, stepsInUnit: 3 });
    expect(rhythmUnit(steps, null)).toEqual({ unit: 2, stepsInUnit: 3 });
    expect(rhythmUnit([], null)).toBeNull();
  });
});
