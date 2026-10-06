import { describe, expect, it } from "vitest";
import { findTopicLeaks, guardWorkbookPage, workbookJsonLd, workbookMeta, workbookPageText } from "./catalogue-guard";
import type { WorkbookDetail } from "./catalogue-types";

/**
 * Build-time guard for the public workbook page (F-005): hidden Theme topics
 * never appear in page text or metadata. The fixture is a wellbeing demo with
 * a Theme whose topics name conditions the copy must not.
 */
const HIDDEN_TOPICS = ["insomnia", "sleep disorder", "anxiety", "depression", "burnout"];

const fixture: WorkbookDetail = {
  card: {
    id: "00000000-0000-0000-0000-000000000001",
    code: "AK-7Q2M4",
    slug: "evenings-with-less-light",
    title: "Evenings With Less Light",
    shortTitle: "Less Light",
    cardLine: "Six weeks of small evening habits, built from the book.",
    genreId: "wellbeing",
    genreName: "Mind and Mood",
    themeId: "quiet-evenings",
    themeName: "Quiet evenings",
    badge: "demo",
    isDemo: true,
    depth: "full",
    safetyTier: "standard",
    authors: ["Maya Vaughn"],
    hasVersion: true,
  },
  bookTitle: "Evenings With Less Light",
  bookLanguage: "en",
  listing: {
    tagline: "For anyone whose evenings run away from them.",
    language: "en",
    structure: { unit: "week", count: 6, free_units: 1 },
    outline: [
      { number: 1, stage: "notice", focus: "Notice how the evening goes now" },
      { number: 2, stage: "notice", focus: "Pick one thing to change" },
    ],
  },
  start: {
    start: { welcome: "Welcome. This workbook takes one small step each week.", how_it_works: ["One exercise a week.", "Your answers stay private."] },
    daily_check: { question: "How did this evening feel?" },
  },
};

describe("catalogue guard", () => {
  it("renders the fixture with no hidden topic in text or metadata", () => {
    expect(guardWorkbookPage(fixture, HIDDEN_TOPICS)).toEqual([]);
  });

  it("catches a topic that leaks into the card line", () => {
    const leaky: WorkbookDetail = { ...fixture, card: { ...fixture.card, cardLine: "Beat insomnia in six weeks." } };
    expect(guardWorkbookPage(leaky, HIDDEN_TOPICS)).toEqual(["insomnia"]);
  });

  it("catches a topic that leaks into the outline or welcome", () => {
    const leaky: WorkbookDetail = { ...fixture, listing: { ...fixture.listing, outline: [{ number: 1, focus: "Burnout and you" }] } };
    expect(guardWorkbookPage(leaky, HIDDEN_TOPICS)).toEqual(["burnout"]);
    const leaky2: WorkbookDetail = { ...fixture, start: { start: { welcome: "If anxiety is part of your evening." } } };
    expect(guardWorkbookPage(leaky2, HIDDEN_TOPICS)).toEqual(["anxiety"]);
  });

  it("matches whole words only, case-insensitively", () => {
    expect(findTopicLeaks("Sleep Disorder Clinic", ["sleep disorder"])).toEqual(["sleep disorder"]);
    expect(findTopicLeaks("a depressions-free zone", ["depression"])).toEqual([]);
    expect(findTopicLeaks("plain text", [""])).toEqual([]);
  });

  it("metadata is the title with author and the card line only", () => {
    expect(workbookMeta(fixture)).toEqual({ title: "Evenings With Less Light by Maya Vaughn", description: "Six weeks of small evening habits, built from the book." });
  });

  it("JSON-LD carries Book and Product with no price and no health claim", () => {
    const ld = workbookJsonLd(fixture);
    expect(ld.map((x) => x["@type"])).toEqual(["Book", "Product"]);
    const text = JSON.stringify(ld);
    expect(text).not.toMatch(/offers|price|treat|cure|therapy|diagnos/i);
    expect(ld[0]).toMatchObject({ author: { "@type": "Person", name: "Maya Vaughn" } });
    expect(ld[1]).toMatchObject({ sku: "AK-7Q2M4", description: fixture.card.cardLine });
  });

  it("page text shows the Demo badge and the outline", () => {
    const text = workbookPageText(fixture);
    expect(text).toContain("Demo");
    expect(text).toContain("Week 2: Pick one thing to change");
    expect(text).not.toContain("<");
  });
});
