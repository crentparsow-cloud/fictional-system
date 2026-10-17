import { describe, expect, it } from "vitest";
import { estimateLine, estimateUnit, roundMinutes, wordCount, type EstimateInput } from "./estimate";

const long = { type: "long_text", answered: false } as const;

describe("wordCount", () => {
  it("counts words, not spaces or marks", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount(undefined)).toBe(0);
    expect(wordCount("One, two - three. It's four!")).toBe(5);
  });
});

describe("estimateUnit", () => {
  it("adds reading time and field time", () => {
    const input: EstimateInput = { unitWords: 200, exercises: [{ done: false, words: 400, fields: [long, long] }] };
    // 600 words at 200 a minute is 3 minutes, plus two long answers at 2 minutes each.
    expect(estimateUnit(input)).toEqual({ minutes: 7, wordsLeft: 600, fieldsLeft: 2 });
  });

  it("falls as fields are answered and exercises are done", () => {
    const base: EstimateInput = { unitWords: 0, exercises: [{ done: false, words: 200, fields: [long, { ...long }] }, { done: false, words: 200, fields: [long] }] };
    const a = estimateUnit(base).minutes;
    const b = estimateUnit({ ...base, exercises: [{ ...base.exercises[0]!, fields: [{ ...long, answered: true }, long] }, base.exercises[1]!] }).minutes;
    const c = estimateUnit({ ...base, exercises: [{ ...base.exercises[0]!, done: true }, base.exercises[1]!] }).minutes;
    expect(b).toBeLessThan(a);
    expect(c).toBeLessThan(b);
  });

  it("does not count optional fields", () => {
    const input: EstimateInput = { unitWords: 0, exercises: [{ done: false, words: 0, fields: [{ type: "long_text", answered: false, optional: true }] }] };
    expect(estimateUnit(input).fieldsLeft).toBe(0);
  });

  it("is zero once every exercise is done", () => {
    const input: EstimateInput = { unitWords: 900, exercises: [{ done: true, words: 0, fields: [] }] };
    expect(estimateUnit(input)).toEqual({ minutes: 0, wordsLeft: 0, fieldsLeft: 0 });
  });

  it("unknown field types count as a short answer", () => {
    const input: EstimateInput = { unitWords: 0, exercises: [{ done: false, words: 0, fields: [{ type: "mystery", answered: false }] }] };
    expect(estimateUnit(input).minutes).toBe(1);
  });
});

describe("roundMinutes", () => {
  it("rounds to figures that read as a guess", () => {
    expect([1, 8, 10].map(roundMinutes)).toEqual([1, 8, 10]);
    expect([12, 14, 33].map(roundMinutes)).toEqual([10, 15, 35]);
    expect([50, 52, 100].map(roundMinutes)).toEqual([45, 45, 105]);
  });
});

describe("estimateLine", () => {
  const e = (minutes: number, wordsLeft = 100, fieldsLeft = 1) => ({ minutes, wordsLeft, fieldsLeft });
  it("says about N minutes left in this unit", () => {
    expect(estimateLine(e(8))).toBe("About 8 minutes left in this unit");
    expect(estimateLine(e(1))).toBe("About a minute left in this unit");
    expect(estimateLine(e(0))).toBe("Less than a minute left in this unit");
    expect(estimateLine(e(60))).toBe("About an hour left in this unit");
  });
  it("says nothing when nothing is left", () => {
    expect(estimateLine(e(0, 0, 0))).toBeNull();
  });
  it("is never a countdown or a deadline", () => {
    for (const m of [0, 1, 5, 12, 40, 90]) {
      const line = estimateLine(e(m)) ?? "";
      expect(line).not.toMatch(/:\d\d|remaining|behind|hurry|only|seconds/i);
      expect(line).not.toMatch(/—|–/);
    }
  });
});
