import { describe, expect, it } from "vitest";
import { parseCodes, parseCollectionForm, parseShelfForm } from "./collections";

const form = (o: Record<string, string | undefined>) => ({ get: (k: string) => o[k] ?? null });
const GENRES = ["wellbeing", "career"];
const ok = { slug: "calm-starts", name: "Calm starts", line: "Gentle first steps.", cover_genre: "wellbeing", cover_pattern: "waves", status: "live", sort: "2", codes: "ak-aaaa2\nAK-BBBB3, AK-CCCC4" };

describe("collection form", () => {
  it("splits and upper-cases codes", () => {
    expect(parseCodes("ak-aaaa2\n\n AK-BBBB3,ak-cccc4 ; ")).toEqual(["AK-AAAA2", "AK-BBBB3", "AK-CCCC4"]);
    expect(parseCodes(undefined)).toEqual([]);
  });

  it("accepts a good form", () => {
    expect(parseCollectionForm(form(ok), GENRES)).toEqual({
      id: null,
      slug: "calm-starts",
      name: "Calm starts",
      line: "Gentle first steps.",
      coverGenre: "wellbeing",
      coverPattern: "waves",
      status: "live",
      sort: 2,
      codes: ["AK-AAAA2", "AK-BBBB3", "AK-CCCC4"],
    });
  });

  it("refuses what the database would refuse", () => {
    for (const bad of [
      { slug: "Bad Slug" },
      { slug: "" },
      { name: "" },
      { name: "x".repeat(81) },
      { line: "x".repeat(201) },
      { cover_genre: "nope" },
      { cover_pattern: "stripes" },
      { status: "maybe" },
      { codes: "AK-AAAA2\nnot-a-code" },
      { codes: "AK-AAAA2\nAK-AAAA2" },
      { id: "not-a-uuid" },
    ]) {
      expect(parseCollectionForm(form({ ...ok, ...bad }), GENRES), JSON.stringify(bad)).toBeNull();
    }
  });

  it("allows an empty pattern, an empty list and a replace by id", () => {
    const r = parseCollectionForm(form({ ...ok, cover_pattern: "", codes: "", id: "11111111-1111-1111-1111-111111111111", sort: "x" }), GENRES);
    expect(r).toMatchObject({ coverPattern: null, codes: [], id: "11111111-1111-1111-1111-111111111111", sort: 0 });
  });
});

describe("shelf form", () => {
  it("reads the line and featured code, clearing blanks", () => {
    expect(parseShelfForm(form({ shelf: "mind-and-mood", line: "  Hello  ", featured: "ak-aaaa2" }))).toEqual({ shelfId: "mind-and-mood", line: "Hello", featuredCode: "AK-AAAA2" });
    expect(parseShelfForm(form({ shelf: "money", line: "", featured: "" }))).toEqual({ shelfId: "money", line: null, featuredCode: null });
  });
  it("refuses a bad shelf, a long line or a bad code", () => {
    expect(parseShelfForm(form({ shelf: "Bad Shelf" }))).toBeNull();
    expect(parseShelfForm(form({ shelf: "money", line: "x".repeat(281) }))).toBeNull();
    expect(parseShelfForm(form({ shelf: "money", featured: "wb-1" }))).toBeNull();
  });
});
