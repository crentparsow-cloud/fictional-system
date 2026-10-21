import { describe, expect, it } from "vitest";
import { makePosition, nextRate, parsePosition, resumeIndex, safeToAdvance, screenKey } from "./listen";

const sentences = ["First idea here, and a bit more.", "Second idea follows on.", "Third closes it."];

describe("resumeIndex", () => {
  const screen = screenKey({ screen: "ak-unit", unit: "2", exercise: null, page: null });
  it("returns to the exact sentence on the same screen", () => {
    expect(resumeIndex(makePosition(screen, 1, sentences[1]!), screen, sentences)).toBe(1);
  });
  it("starts at the top on a different screen", () => {
    const other = screenKey({ screen: "ak-unit", unit: "3", exercise: null, page: null });
    expect(resumeIndex(makePosition(other, 2, sentences[2]!), screen, sentences)).toBe(0);
  });
  it("finds the sentence again when the page shifted", () => {
    const shifted = ["A new line at the top.", ...sentences];
    expect(resumeIndex(makePosition(screen, 1, sentences[1]!), screen, shifted)).toBe(2);
  });
  it("starts at the top when the sentence is gone, or nothing was stored", () => {
    expect(resumeIndex(makePosition(screen, 1, "Something that was removed."), screen, sentences)).toBe(0);
    expect(resumeIndex(null, screen, sentences)).toBe(0);
    expect(resumeIndex(makePosition(screen, 1, "x"), screen, [])).toBe(0);
  });
});

describe("parsePosition", () => {
  it("round trips and rejects junk", () => {
    const p = makePosition("s", 4, "Hello there");
    expect(parsePosition(JSON.stringify(p))).toEqual(p);
    expect(parsePosition("nope")).toBeNull();
    expect(parsePosition(JSON.stringify({ screen: "s", index: -1, lead: "" }))).toBeNull();
    expect(parsePosition(null)).toBeNull();
  });
  it("keeps only the first 40 characters of a sentence", () => {
    expect(makePosition("s", 0, "x".repeat(200)).lead).toHaveLength(40);
  });
});

describe("rates and advance", () => {
  it("cycles through speeds that never pass 2", () => {
    let r = 0.8;
    const seen: number[] = [];
    for (let i = 0; i < 7; i++) {
      r = nextRate(r);
      seen.push(r);
    }
    expect(Math.max(...seen)).toBe(2);
    expect(seen[5]).toBe(0.8);
  });
  it("never presses Done or walks into the answers", () => {
    expect(safeToAdvance("Next")).toBe(true);
    expect(safeToAdvance("See an example")).toBe(true);
    expect(safeToAdvance("Done")).toBe(false);
    expect(safeToAdvance("Your turn")).toBe(false);
    expect(safeToAdvance("")).toBe(false);
  });
});
