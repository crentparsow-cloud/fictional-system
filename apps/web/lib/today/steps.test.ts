import { describe, expect, it } from "vitest";
import { answered, step } from "@/lib/today/fixtures";
import { countWord, doneExerciseIds, hasFromFieldPaths, nextStep, remainingSteps, stepFilled, stepsFromUnitSections } from "@/lib/today/steps";

const ex = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `Title ${id}`,
  minutes: 12,
  fields: [
    { id: "what", type: "long_text", label: "What?" },
    { id: "extra", type: "short_text", label: "More", optional: true },
  ],
  ...extra,
});

describe("stepsFromUnitSections", () => {
  it("lists exercises in programme order with the unit name and counts per unit", () => {
    const steps = stepsFromUnitSections([
      { unit_number: 2, body: { focus: "Second unit", exercises: [ex("c")] } },
      { unit_number: 1, body: { focus: "First unit", exercises: [ex("a"), ex("b", { short_version: { minutes: 3, steps: [], field_ids: ["what"] } })] } },
      { unit_number: null, body: { focus: "Not a unit" } },
    ]);
    expect(steps.map((s) => s.exerciseId)).toEqual(["a", "b", "c"]);
    expect(steps[0]).toMatchObject({ unit: 1, unitName: "First unit", indexInUnit: 0, countInUnit: 2 });
    expect(steps[1]).toMatchObject({ indexInUnit: 1, short: { minutes: 3, fieldIds: ["what"] } });
    expect(steps[2]).toMatchObject({ unit: 2, countInUnit: 1 });
  });

  it("skips anything malformed rather than failing", () => {
    expect(stepsFromUnitSections([{ unit_number: 1, body: { focus: "x", exercises: [null, 3, { nope: true }] } }])).toEqual([]);
  });
});

describe("done, next and remaining", () => {
  const steps = [step(1, "a"), step(1, "b"), step(2, "c")];
  it("reads only step_done events for plain ids", () => {
    const done = doneExerciseIds([
      { kind: "step_done", ref: "a" },
      { kind: "step_done", ref: "b~r" },
      { kind: "checkin_done", ref: "1" },
      { kind: "toolkit_used", ref: "c" },
    ]);
    expect([...done]).toEqual(["a"]);
    expect(nextStep(steps, done)?.exerciseId).toBe("b");
    expect(remainingSteps(steps, done).map((s) => s.exerciseId)).toEqual(["b", "c"]);
  });
  it("has no next step when everything is done", () => {
    expect(nextStep(steps, new Set(["a", "b", "c"]))).toBeNull();
  });
});

describe("stepFilled", () => {
  it("needs every required field, and ignores optional ones", () => {
    const s = step(1, "plan");
    expect(stepFilled(s, answered("plan.what"))).toBe(true);
    expect(stepFilled(s, answered("plan.note"))).toBe(false);
    expect(stepFilled(s, answered())).toBe(false);
  });
  it("accepts the short version's fields alone when the exercise has one", () => {
    const s = step(1, "plan", {
      fields: [
        { id: "a", type: "long_text", label: "A", optional: false, sensitive: false },
        { id: "b", type: "long_text", label: "B", optional: false, sensitive: false },
      ],
      short: { minutes: 3, fieldIds: ["a"] },
    });
    expect(stepFilled(s, answered("plan.a"))).toBe(true);
    expect(stepFilled(s, answered("plan.b"))).toBe(false);
  });
  it("reads answer paths from the answers table's field names", () => {
    const has = hasFromFieldPaths(new Set(["exercise:plan.what"]));
    expect(has("plan", "what")).toBe(true);
    expect(has("plan", "other")).toBe(false);
  });
});

describe("countWord", () => {
  it("uses words up to ten", () => {
    expect([countWord(1), countWord(2), countWord(10), countWord(11)]).toEqual(["one", "two", "ten", "11"]);
  });
});
