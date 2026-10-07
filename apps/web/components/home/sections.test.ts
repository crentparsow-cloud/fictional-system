import { describe, expect, it } from "vitest";
import type { LibraryCard } from "@/lib/catalogue-types";
import { buildHomeSections, HERO_APPROVAL_NOTE, HOME_CARD_LIMIT, LEGAL_LINKS, pickHomeCards } from "@/components/home/sections";

const base = { brandName: "Akana", line: "The place where books become practical.", wellnessNotice: "Not treatment." };

function card(n: number, isDemo = false): LibraryCard {
  return {
    id: `id-${n}`, code: `AK-0000${n}`, slug: `wb-${n}`, title: `Title ${n}`, shortTitle: null, cardLine: "Line.",
    genreId: "business", genreName: "Business", themeId: null, themeName: null,
    badge: isDemo ? "demo" : "official", isDemo, depth: "full", safetyTier: "none", authors: ["A"], hasVersion: true,
  };
}

describe("buildHomeSections (F-002)", () => {
  it("renders the empty library state from an empty card list", () => {
    const s = buildHomeSections({ ...base, cards: [] });
    expect(s.library.kind).toBe("empty");
    if (s.library.kind === "empty") {
      expect(s.library.message).toMatch(/being stocked/);
      expect(s.library.more.href).toBe("/publish");
    }
    // Everything else still renders.
    expect(s.trust.points).toHaveLength(4);
    expect(s.steps.items).toHaveLength(3);
    expect(s.publishers.link.href).toBe("/publish");
  });

  it("shows at most eight cards, real titles before demo ones", () => {
    const cards = [card(1, true), card(2), card(3, true), ...Array.from({ length: 10 }, (_, i) => card(10 + i))];
    const s = buildHomeSections({ ...base, cards });
    expect(s.library.kind).toBe("cards");
    if (s.library.kind === "cards") {
      expect(s.library.cards).toHaveLength(HOME_CARD_LIMIT);
      expect(s.library.cards.every((c) => !c.isDemo)).toBe(true);
    }
    expect(pickHomeCards([card(1, true), card(2)]).map((c) => c.id)).toEqual(["id-2", "id-1"]);
  });

  it("keeps the approval note visible until the line is approved", () => {
    expect(buildHomeSections({ ...base, cards: [] }).hero.approvalNote).toBe(HERO_APPROVAL_NOTE);
    expect(buildHomeSections({ ...base, cards: [], lineApproved: true }).hero.approvalNote).toBeNull();
  });

  it("links the four legal pages, Help now and Publish in the footer", () => {
    const s = buildHomeSections({ ...base, cards: [] });
    expect(s.footer.legal).toEqual(LEGAL_LINKS);
    expect(s.footer.legal.map((l) => l.href)).toEqual(["/legal/terms", "/legal/privacy", "/legal/cookies", "/legal/refunds"]);
    expect(s.footer.other.map((l) => l.href)).toEqual(["/help-now", "/publish"]);
  });

  it("makes no outcome claims and uses no em dashes in its copy", () => {
    const text = JSON.stringify(buildHomeSections({ ...base, cards: [] }));
    expect(text).not.toMatch(/\\u2014/);
    expect(text).not.toMatch(/\b(proven|guarantee|transform|results|improve|cure|heal)\w*/i);
  });
});
