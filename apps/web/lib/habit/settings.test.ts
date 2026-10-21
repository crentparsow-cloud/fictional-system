import { describe, expect, it } from "vitest";
import { clampGoal, companionChoice, companionValue, habitNotice, parseHabitForm } from "./settings";

const form = (o: Record<string, string>) => ({ get: (k: string) => (k in o ? o[k]! : null) });

describe("parseHabitForm", () => {
  it("reads the switches and the goal", () => {
    expect(parseHabitForm(form({ run: "on", goal: "2", companion: "off", usual: "on" }))).toEqual({ runOn: true, goal: 2, companion: "off", usualTime: true });
  });
  it("defaults to everything off, one step, and the companion default", () => {
    expect(parseHabitForm(form({}))).toEqual({ runOn: false, goal: 1, companion: "default", usualTime: false });
  });
  it("refuses a goal that is not a whole number in range, or an unknown companion choice", () => {
    expect(parseHabitForm(form({ goal: "0" }))).toBeNull();
    expect(parseHabitForm(form({ goal: "2.5" }))).toBeNull();
    expect(parseHabitForm(form({ goal: "11" }))).toBeNull();
    expect(parseHabitForm(form({ companion: "maybe" }))).toBeNull();
  });
});

describe("companion choice", () => {
  it("round trips through the stored value", () => {
    expect(companionValue("default")).toBeNull();
    expect(companionValue("on")).toBe(true);
    expect(companionValue("off")).toBe(false);
    expect(companionChoice(null)).toBe("default");
    expect(companionChoice(true)).toBe("on");
    expect(companionChoice(false)).toBe("off");
    expect(companionChoice(undefined)).toBe("default");
  });
});

describe("clampGoal", () => {
  it("keeps the goal within one and the ceiling", () => {
    expect(clampGoal(5, 3)).toBe(3);
    expect(clampGoal(0, 3)).toBe(1);
    expect(clampGoal(2, 3)).toBe(2);
    expect(clampGoal(Number.NaN, 3)).toBe(1);
  });
});

describe("habitNotice", () => {
  it("knows its codes and ignores others", () => {
    expect(habitNotice("saved")).toBe("Saved.");
    expect(habitNotice("nope")).toBeNull();
    expect(habitNotice(undefined)).toBeNull();
    expect(habitNotice(["saved"])).toBeNull();
  });
});
