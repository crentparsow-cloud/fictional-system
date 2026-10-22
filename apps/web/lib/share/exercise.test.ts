import { describe, expect, it } from "vitest";
import { exercisePath, freeUnitNumbers, promptsFromUnitBody } from "@/lib/share/exercise";

describe("promptsFromUnitBody", () => {
  const body = {
    focus: "Start",
    exercises: [
      {
        id: "plan_first_step",
        title: "Plan a first step",
        purpose: "Pick one small thing.",
        minutes: 12,
        example: { character: "Sam", text: "I wrote a worked answer." },
        steps: [{ text: "Do this." }],
        fields: [{ id: "a", type: "text", label: "What is the step?" }, { id: "b", type: "text", label: "  When will you do it?  " }, { id: "c", label: "" }],
      },
      { id: "Bad Id", title: "x", fields: [] },
      { id: "no_title", title: "  ", fields: [] },
      "junk",
    ],
  };
  it("keeps the title, purpose, minutes and question labels, and nothing else", () => {
    const [p, ...rest] = promptsFromUnitBody(body);
    expect(rest).toEqual([]);
    expect(p).toEqual({ id: "plan_first_step", title: "Plan a first step", purpose: "Pick one small thing.", minutes: 12, questions: ["What is the step?", "When will you do it?"] });
    expect(JSON.stringify(p)).not.toContain("worked answer");
  });
  it("copes with odd bodies", () => {
    expect(promptsFromUnitBody(null)).toEqual([]);
    expect(promptsFromUnitBody({})).toEqual([]);
    expect(promptsFromUnitBody({ exercises: "x" })).toEqual([]);
  });
});

describe("free units and paths", () => {
  it("defaults to unit 1 and never passes four", () => {
    expect(freeUnitNumbers(undefined)).toEqual([1]);
    expect(freeUnitNumbers(0)).toEqual([1]);
    expect(freeUnitNumbers(2)).toEqual([1, 2]);
    expect(freeUnitNumbers(9)).toEqual([1, 2, 3, 4]);
  });
  it("builds a path only from safe parts", () => {
    expect(exercisePath("plan-your-week", "plan_first_step")).toBe("/ex/plan-your-week/plan_first_step");
    expect(exercisePath("Plan", "x")).toBeNull();
    expect(exercisePath("plan", "../x")).toBeNull();
  });
});
