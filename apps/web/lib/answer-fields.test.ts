import { describe, expect, it } from "vitest";
import { FIELD_PATTERN, fieldKey, splitFieldKey } from "./answer-fields";

describe("answer field paths", () => {
  it("prefixes exercise scopes and leaves screen scopes alone", () => {
    expect(fieldKey("plan_first_step", "what")).toBe("exercise:plan_first_step.what");
    expect(fieldKey("plan_first_step~r", "what")).toBe("exercise:plan_first_step~r.what");
    expect(fieldKey("checkin:3", "mood")).toBe("checkin:3.mood");
    expect(fieldKey("start", "why")).toBe("start.why");
    expect(fieldKey("keep_going", "q0")).toBe("keep_going.q0");
  });

  it("inverts cleanly", () => {
    for (const [scope, fieldId] of [
      ["plan_first_step", "what"],
      ["plan_first_step~r", "what"],
      ["checkin:3", "mood"],
      ["start", "why"],
    ] as const) {
      expect(splitFieldKey(fieldKey(scope, fieldId))).toEqual({ scope, fieldId });
    }
    expect(splitFieldKey("nodot")).toBeNull();
    expect(splitFieldKey(".x")).toBeNull();
  });

  it("every path the engine writes matches the route's pattern", () => {
    expect(FIELD_PATTERN.test(fieldKey("e05~r", "f_two"))).toBe(true);
    expect(FIELD_PATTERN.test(fieldKey("checkin:12", "mood"))).toBe(true);
    expect(FIELD_PATTERN.test("I felt low")).toBe(false);
  });
});
