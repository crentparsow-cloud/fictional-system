import { describe, expect, it } from "vitest";
import { countIsCurrent, wordsIn, wordsLine } from "./words";

describe("wordsIn", () => {
  it("counts words in text", () => {
    expect(wordsIn("")).toBe(0);
    expect(wordsIn("one")).toBe(1);
    expect(wordsIn("  one   two\nthree  ")).toBe(3);
    expect(wordsIn("I don't know. It's well-known, though.")).toBe(6);
    expect(wordsIn("café naïve")).toBe(2);
  });

  it("counts text inside lists and objects but not numbers, flags or keys", () => {
    expect(wordsIn(["a b", "c"])).toBe(3);
    expect(wordsIn({ what: "two words", rating: 7, done: true })).toBe(2);
    expect(wordsIn({ rows: [{ a: "x y z" }, { a: "q" }] })).toBe(4);
    expect(wordsIn(null)).toBe(0);
    expect(wordsIn(42)).toBe(0);
  });

  it("does not count bare punctuation", () => {
    expect(wordsIn("- - ... !!")).toBe(0);
  });
});

describe("countIsCurrent", () => {
  it("recounts an answer written after its count", () => {
    expect(countIsCurrent("2026-10-10T10:00:00Z", "2026-10-10T09:00:00Z")).toBe(true);
    expect(countIsCurrent("2026-10-10T10:00:00Z", "2026-10-10T10:00:00Z")).toBe(true);
    expect(countIsCurrent("2026-10-10T10:00:00Z", "2026-10-11T09:00:00Z")).toBe(false);
    expect(countIsCurrent(null, "2026-10-11T09:00:00Z")).toBe(false);
  });
});

describe("wordsLine", () => {
  it("formats with a thousands separator", () => {
    expect(wordsLine(1200)).toBe("You wrote 1,200 words this month.");
    expect(wordsLine(1)).toBe("You wrote 1 word this month.");
  });
  it("says nothing for a quiet month", () => {
    expect(wordsLine(0)).toBeNull();
    expect(wordsLine(-5)).toBeNull();
  });
});
