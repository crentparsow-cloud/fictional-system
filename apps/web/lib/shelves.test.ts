import { describe, expect, it } from "vitest";
import { buildPatternCover, collectionPanelClip, COVER_PATTERNS } from "./covers";
import { SHELF_ICON_PATHS, SHELF_STYLES, shelfStyle, FALLBACK_SHELF_STYLE } from "./shelves";
import messages from "../messages/en-GB.json";

describe("shelf styles", () => {
  const ids = ["mind-and-mood", "work-and-career", "money", "family-and-parenting", "love-and-relationships", "personal-growth", "learning-and-skills", "health-and-body", "faith-and-spirituality", "creativity-and-making"];

  it("covers the ten shelves with a colour, an icon and a line", () => {
    for (const id of ids) {
      expect(SHELF_STYLES[id], id).toBeDefined();
      expect(SHELF_ICON_PATHS[SHELF_STYLES[id]!.icon].length, id).toBeGreaterThan(0);
      expect(Object.hasOwn(messages, `shelf.line.${id}`), id).toBe(true);
    }
  });

  it("falls back for an unknown shelf", () => {
    expect(shelfStyle("brand-new")).toBe(FALLBACK_SHELF_STYLE);
    expect(shelfStyle(null)).toBe(FALLBACK_SHELF_STYLE);
  });
});

describe("collection cover", () => {
  it("draws from the cover pattern system with a pattern override", () => {
    const svg = buildPatternCover("wellbeing", "dots", "clip-x");
    expect(svg).toContain('url(#clip-x)');
    expect(svg).toContain("<circle");
    expect(buildPatternCover("wellbeing", "grid", "c")).not.toBe(buildPatternCover("wellbeing", "dots", "c"));
  });
  it("uses the genre's own pattern when none is given or the name is unknown", () => {
    expect(buildPatternCover("finance", null, "c")).toBe(buildPatternCover("finance", "columns", "c"));
    expect(buildPatternCover("finance", "stripes", "c")).toBe(buildPatternCover("finance", "columns", "c"));
  });
  it("renders every pattern and a matching clip path", () => {
    for (const p of COVER_PATTERNS) expect(buildPatternCover("career", p, "c").length, p).toBeGreaterThan(100);
    expect(collectionPanelClip("abc")).toContain('id="abc"');
  });
});
