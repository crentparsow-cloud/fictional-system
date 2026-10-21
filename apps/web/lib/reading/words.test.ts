import { describe, expect, it } from "vitest";
import { readBoundary, sourceWordRange, toSourceOffset, wordRangeAt } from "./words";

describe("wordRangeAt", () => {
  const t = "Take one slow breath, then go.";
  it("returns the word that starts at the position", () => {
    expect(wordRangeAt(t, 0)).toEqual({ start: 0, end: 4 });
    expect(wordRangeAt(t, 5)).toEqual({ start: 5, end: 8 });
  });
  it("returns the whole word when the position is inside it", () => {
    expect(wordRangeAt(t, 12)).toEqual({ start: 9, end: 13 });
  });
  it("moves to the next word from a gap or punctuation", () => {
    expect(wordRangeAt(t, 4)).toEqual({ start: 5, end: 8 });
    expect(wordRangeAt(t, 20)).toEqual({ start: 22, end: 26 });
  });
  it("keeps apostrophes and hyphens inside a word", () => {
    expect(wordRangeAt("It's a well-known thing.", 0)).toEqual({ start: 0, end: 4 });
    expect(wordRangeAt("It's a well-known thing.", 7)).toEqual({ start: 7, end: 17 });
  });
  it("gives nothing past the end or for a bad position", () => {
    expect(wordRangeAt(t, 99)).toBeNull();
    expect(wordRangeAt(t, -1)).toBeNull();
    expect(wordRangeAt("...", 0)).toBeNull();
  });
});

describe("toSourceOffset and sourceWordRange", () => {
  const source = "First line.\n\n   Second   sentence here.  ";
  const start = source.indexOf("Second");
  const spoken = "Second sentence here.";
  it("maps a spoken position back through folded whitespace", () => {
    expect(toSourceOffset(source, start, 0)).toBe(start);
    expect(toSourceOffset(source, start, 7)).toBe(source.indexOf("sentence"));
  });
  it("finds the word in the page text", () => {
    const r = sourceWordRange(source, start, spoken, 7)!;
    expect(source.slice(r.start, r.end)).toBe("sentence");
    const r2 = sourceWordRange(source, start, spoken, 16)!;
    expect(source.slice(r2.start, r2.end)).toBe("here");
  });
  it("returns null when the position is outside the sentence", () => {
    expect(sourceWordRange(source, start, spoken, 200)).toBeNull();
  });
});

describe("readBoundary", () => {
  it("accepts word boundaries and events with no name", () => {
    expect(readBoundary({ name: "word", charIndex: 3 })).toEqual({ charIndex: 3 });
    expect(readBoundary({ charIndex: 0 })).toEqual({ charIndex: 0 });
  });
  it("ignores sentence boundaries and anything malformed", () => {
    expect(readBoundary({ name: "sentence", charIndex: 3 })).toBeNull();
    expect(readBoundary({ name: "word", charIndex: -1 })).toBeNull();
    expect(readBoundary({ name: "word" })).toBeNull();
    expect(readBoundary(null)).toBeNull();
    expect(readBoundary("x")).toBeNull();
  });
});
