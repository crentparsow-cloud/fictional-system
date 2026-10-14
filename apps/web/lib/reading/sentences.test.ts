import { describe, expect, it } from "vitest";
import { chunkSentences, MAX_CHUNK } from "./sentences";

describe("chunkSentences", () => {
  it("splits on full stops, question marks and exclamation marks", () => {
    const t = "First thought. Second one? Third!";
    expect(chunkSentences(t).map((c) => c.text)).toEqual(["First thought.", "Second one?", "Third!"]);
  });

  it("keeps offsets into the original string", () => {
    const t = "  One here.   Two there.";
    for (const c of chunkSentences(t)) expect(t.slice(c.start, c.end)).toBe(c.text);
  });

  it("does not split after an abbreviation, an initial or a decimal", () => {
    expect(chunkSentences("Dr. Okafor met J. Smith at 3.5 percent.")).toHaveLength(1);
    expect(chunkSentences("Ask Mr. Hale. He knows.").map((c) => c.text)).toEqual(["Ask Mr. Hale.", "He knows."]);
  });

  it("keeps closing quotes with their sentence", () => {
    expect(chunkSentences('She said "stop." Then she left.').map((c) => c.text)).toEqual(['She said "stop."', "Then she left."]);
  });

  it("cuts a long sentence at a clause break, never past the cap", () => {
    const clause = "this is a clause of a fair length, ";
    const t = `${clause.repeat(12)}and then it ends.`;
    const chunks = chunkSentences(t);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(MAX_CHUNK);
    expect(chunks.map((c) => c.text).join(" ")).toBe(t.replace(/\s+/g, " ").trim());
  });

  it("cuts at a space when there is no punctuation to use", () => {
    const t = "word ".repeat(100).trim();
    const chunks = chunkSentences(t, 60);
    expect(chunks.every((c) => c.text.length <= 60)).toBe(true);
    expect(chunks.map((c) => c.text).join(" ")).toBe(t);
  });

  it("treats a blank line as a break and drops empty chunks", () => {
    expect(chunkSentences("A heading\n\nBody text here.").map((c) => c.text)).toEqual(["A heading", "Body text here."]);
    expect(chunkSentences("   \n ... ")).toEqual([]);
    expect(chunkSentences("")).toEqual([]);
  });

  it("returns text with no end mark as one chunk", () => {
    expect(chunkSentences("No end mark").map((c) => c.text)).toEqual(["No end mark"]);
  });
});
