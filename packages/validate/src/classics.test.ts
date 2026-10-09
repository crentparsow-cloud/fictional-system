import { describe, expect, it } from "vitest";
import { checkCopyright, checkScanQuality, modernise, revert, stripGutenbergBoilerplate } from "./classics";

describe("classics source checks", () => {
  it("applies the UK life plus 70 rule to the end of the calendar year", () => {
    const long = { name: "George Long", role: "translator", died: 1879 };
    expect(checkCopyright({ published: 1862, people: [long], asOf: 2026 })).toMatchObject({ publishedBefore1931: true, ukLifePlus70: true, ukTermEnds: 1949, clear: true });
    // Died 1956: term runs to the end of 2026, clear from 2027.
    const recent = { name: "A. N. Other", role: "author", died: 1956 };
    expect(checkCopyright({ published: 1920, people: [recent], asOf: 2026 }).clear).toBe(false);
    expect(checkCopyright({ published: 1920, people: [recent], asOf: 2027 }).clear).toBe(true);
    // A missing death year is never clear, however old the book.
    const r = checkCopyright({ published: 1758, people: [{ name: "Unknown editor", role: "editor" }], asOf: 2026 });
    expect(r.clear).toBe(false);
    expect(r.missingDeathYears).toEqual(["Unknown editor"]);
  });

  it("measures scan quality", () => {
    expect(checkScanQuality("A clean page of text, with a few 'quotes' and 1 number.").suspect).toBe(false);
    const broken = "The qu\\uFFFDck br0wn fox \\u0000\\u0001\\u0002\\u0003 jumps";
    const q = checkScanQuality(broken);
    expect(q.replacementChars).toBe(1);
    expect(q.digitsInWords).toBe(1);
    expect(q.suspect).toBe(true);
  });

  it("modernises reversibly, even when the modern word was already in the line", () => {
    const original = "To-day and today \\u2014 any one may shew it.\n\\u201CWell,\\u201D said he, &c.\nUnchanged line.";
    const { text, log } = modernise(original);
    expect(text).toBe('Today and today, anyone may show it.\n"Well," said he, etc.\nUnchanged line.');
    expect(log.map((e) => e.note)).toEqual([
      "hyphenated To-day",
      "two-word any one (not before 'of')",
      "shew",
      "em dash to comma",
      "ampersand c",
      "curly double quote",
      "curly double quote",
    ]);
    expect(revert(text, log)).toBe(original);
    expect(() => revert(text.replace("anyone", "someone"), log)).toThrow(/changed since/);
  });

  it("strips a Project Gutenberg header and licence", () => {
    const src = "Header\n*** START OF THE PROJECT GUTENBERG EBOOK MEDITATIONS ***\nBook I.\nText.\n*** END OF THE PROJECT GUTENBERG EBOOK MEDITATIONS ***\nLicence.";
    expect(stripGutenbergBoilerplate(src)).toEqual({ text: "Book I.\nText.\n", stripped: true });
    expect(stripGutenbergBoilerplate("No markers").stripped).toBe(false);
  });
});
