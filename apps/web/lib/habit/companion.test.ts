import { habitLanguageHits } from "@akana/validate";
import { describe, expect, it } from "vitest";
import {
  companionStage,
  companionWords,
  DEFAULT_STAGE_STEPS,
  effectiveSteps,
  growthLine,
  hashSeed,
  LINES,
  parseStageSteps,
  QUESTIONS,
  STAGE_NAMES,
  WELCOME_BACK_LINES,
} from "./companion";

describe("companionStage", () => {
  it("starts as a seed and grows at each threshold", () => {
    expect(companionStage(0).stage).toBe(0);
    expect(companionStage(2).stage).toBe(0);
    expect(companionStage(3).stage).toBe(1);
    expect(companionStage(24).stage).toBe(2);
    expect(companionStage(25).stage).toBe(3);
    expect(companionStage(200).stage).toBe(6);
    expect(companionStage(5000).stage).toBe(6);
  });

  it("says how many steps to the next stage and stops at the last", () => {
    expect(companionStage(8).toNext).toBe(2);
    expect(companionStage(8).last).toBe(false);
    expect(companionStage(200).toNext).toBeNull();
    expect(companionStage(200).last).toBe(true);
  });

  it("has a name for every stage", () => {
    expect(STAGE_NAMES).toHaveLength(DEFAULT_STAGE_STEPS.length + 1);
  });
});

describe("effectiveSteps", () => {
  it("never goes below the stored high-water mark", () => {
    expect(effectiveSteps(3, 12)).toBe(12);
    expect(effectiveSteps(20, 12)).toBe(20);
    expect(companionStage(effectiveSteps(0, 30)).stage).toBe(3);
  });
});

describe("parseStageSteps", () => {
  it("accepts a sorted list and rejects anything else", () => {
    expect(parseStageSteps([2, 5, 9])).toEqual([2, 5, 9]);
    expect(parseStageSteps([5, 2])).toEqual(DEFAULT_STAGE_STEPS);
    expect(parseStageSteps("nope")).toEqual(DEFAULT_STAGE_STEPS);
    expect(parseStageSteps([])).toEqual(DEFAULT_STAGE_STEPS);
    expect(parseStageSteps([0, 3])).toEqual(DEFAULT_STAGE_STEPS);
    expect(parseStageSteps([1, 2, 3, 4, 5, 6, 7, 8])).toEqual(DEFAULT_STAGE_STEPS);
  });
});

describe("companionWords", () => {
  it("is stable for a seed and varies across seeds", () => {
    expect(companionWords("a|2026-10-21")).toEqual(companionWords("a|2026-10-21"));
    const seen = new Set(Array.from({ length: 60 }, (_, i) => companionWords(`u|2026-10-${i}`).text));
    expect(seen.size).toBeGreaterThan(4);
  });

  it("gives a welcome, never a question, to a returning reader", () => {
    for (let i = 0; i < 20; i++) {
      const w = companionWords(`x${i}`, { returning: true });
      expect(w.kind).toBe("line");
      expect(WELCOME_BACK_LINES).toContain(w.text);
    }
  });

  it("uses questions some of the time", () => {
    const kinds = new Set(Array.from({ length: 60 }, (_, i) => companionWords(`k${i}`).kind));
    expect(kinds).toEqual(new Set(["line", "question"]));
  });

  it("hashes deterministically", () => {
    expect(hashSeed("abc")).toBe(hashSeed("abc"));
    expect(hashSeed("abc")).not.toBe(hashSeed("abd"));
  });
});

describe("the companion's words follow the habit rules", () => {
  const all = [...LINES, ...QUESTIONS, ...WELCOME_BACK_LINES];
  for (const stage of [0, 1, 3, 6]) all.push(growthLine(companionStage([0, 3, 10, 25, 50, 100, 200][stage]!)));

  it("passes the mental health lint with no hits at all", () => {
    for (const line of all) expect(habitLanguageHits(line), line).toEqual([]);
  });

  it("never mentions time away, loss or withering", () => {
    for (const line of all) expect(line, line).not.toMatch(/\b(days?|weeks?|away|missed|lost|lose|wither|died|dying|sad|miss you|waiting for you)\b/i);
  });

  it("uses no em dash and no exclamation mark", () => {
    for (const line of all) expect(line).not.toMatch(/[—!]/);
  });
});
