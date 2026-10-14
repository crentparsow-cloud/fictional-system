import { describe, expect, it } from "vitest";
import { buildPath, celebrationFor, pathChange, unitIsDone, type PathUnitInput } from "./path";

const units: PathUnitInput[] = [
  { number: 1, focus: "Notice", exerciseIds: ["a", "b"] },
  { number: 2, focus: "Choose", exerciseIds: ["c"] },
  { number: 3, focus: "Begin", exerciseIds: ["d", "e"] },
  { number: 4, focus: "Keep going", exerciseIds: ["f"] },
];
const states = (done: string[], lockedUnits?: number[]) => buildPath({ units, done: new Set(done), lockedUnits }).map((n) => `${n.state}${n.reason ? `:${n.reason}` : ""}`);

describe("buildPath", () => {
  it("starts with unit 1 as today and the rest ahead", () => {
    expect(states([])).toEqual(["today", "locked:ahead", "locked:ahead", "locked:ahead"]);
  });

  it("moves today on when a unit is finished", () => {
    expect(states(["a", "b"])).toEqual(["done", "today", "locked:ahead", "locked:ahead"]);
    expect(states(["a", "b", "c"])).toEqual(["done", "done", "today", "locked:ahead"]);
  });

  it("keeps a half-finished unit as today and points Start at the next exercise", () => {
    const path = buildPath({ units, done: new Set(["a"]) });
    expect(path[0]).toMatchObject({ state: "today", stepsDone: 1, stepsTotal: 2, startExerciseId: "b" });
  });

  it("has no today when everything is done", () => {
    expect(states(["a", "b", "c", "d", "e", "f"])).toEqual(["done", "done", "done", "done"]);
  });

  it("marks units the purchase does not cover as locked for the paywall, and leaves no today at the wall", () => {
    expect(states(["a", "b"], [2, 3, 4])).toEqual(["done", "locked:paywall", "locked:paywall", "locked:paywall"]);
  });

  it("keeps a done unit done even when it comes after today", () => {
    expect(states(["d", "e"])).toEqual(["today", "locked:ahead", "done", "locked:ahead"]);
  });

  it("sorts units and treats a unit with no exercises as never done", () => {
    const path = buildPath({ units: [{ number: 2, focus: "B", exerciseIds: [] }, { number: 1, focus: "A", exerciseIds: ["x"] }], done: new Set(["x"]) });
    expect(path.map((n) => [n.number, n.state])).toEqual([[1, "done"], [2, "today"]]);
    expect(unitIsDone({ number: 9, focus: "", exerciseIds: [] }, new Set())).toBe(false);
  });

  it("ignores repeat scopes, which are not exercises of the unit", () => {
    expect(states(["a~r", "b~r"])[0]).toBe("today");
  });
});

describe("pathChange", () => {
  const before = buildPath({ units, done: new Set(["a"]) });
  it("reports a unit that has just closed and where today moved", () => {
    const after = buildPath({ units, done: new Set(["a", "b"]) });
    expect(pathChange(before, after)).toEqual({ closed: [1], movedTo: 2 });
  });
  it("reports nothing when a step is done inside a unit", () => {
    const after = buildPath({ units: [...units], done: new Set(["a"]) });
    expect(pathChange(before, after)).toEqual({ closed: [], movedTo: null });
  });
  it("does not report a unit that was already done", () => {
    const done = buildPath({ units, done: new Set(["a", "b"]) });
    expect(pathChange(done, done).closed).toEqual([]);
  });
});

describe("celebrationFor", () => {
  const closed = { closed: [2], movedTo: 3 };
  it("gives one line and one confetti moment", () => {
    expect(celebrationFor(closed, { word: "week", total: 6, tier: "none" })).toEqual({ unit: 2, line: "Week 2 is complete.", confetti: true });
  });
  it("keeps a wellbeing title quiet", () => {
    expect(celebrationFor(closed, { word: "week", total: 6, tier: "standard" })?.confetti).toBe(false);
    expect(celebrationFor(closed, { word: "week", total: 6, tier: "higher" })?.confetti).toBe(false);
  });
  it("says something different for the last unit", () => {
    expect(celebrationFor({ closed: [6], movedTo: null }, { word: "week", total: 6, tier: "none" })?.line).toBe("You have finished the last week. Well done.");
  });
  it("is null when nothing closed, and takes the last of several", () => {
    expect(celebrationFor({ closed: [], movedTo: null }, { word: "day", total: 5, tier: "none" })).toBeNull();
    expect(celebrationFor({ closed: [1, 2], movedTo: 3 }, { word: "day", total: 5, tier: "none" })?.unit).toBe(2);
  });
  it("never counts streaks or missed days", () => {
    const c = celebrationFor(closed, { word: "week", total: 6, tier: "none" });
    expect(c?.line).not.toMatch(/streak|in a row|missed|days/i);
  });
});
