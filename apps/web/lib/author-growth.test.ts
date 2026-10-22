import { describe, expect, it } from "vitest";
import {
  AUTHOR_LINK_MESSAGES,
  AUTHOR_LINK_STATEMENTS,
  addRecommendation,
  isAuthorLinkCode,
  isAuthorLinkUse,
  recommendBackCandidates,
  removeRecommendation,
  shareConfigFrom,
  shareSentence,
  type RecommendationRow,
} from "./author-growth";

describe("author link", () => {
  it("accepts only ten lower-case hex characters", () => {
    expect(isAuthorLinkCode("0123456789")).toBe(true);
    expect(isAuthorLinkCode("012345678")).toBe(false);
    expect(isAuthorLinkCode("0123abcdef")).toBe(true);
    expect(isAuthorLinkCode("0123ABCDEF")).toBe(false);
    expect(isAuthorLinkCode("../../etc")).toBe(false);
  });
  it("has a message for every outcome and tells the reader the author earns a share", () => {
    for (const k of ["attached", "already", "unknown_code", "own_link", "not_new"]) expect(isAuthorLinkUse(k)).toBe(true);
    expect(isAuthorLinkUse("other")).toBe(false);
    expect(Object.values(AUTHOR_LINK_MESSAGES).every((m) => m.length > 10)).toBe(true);
    const text = AUTHOR_LINK_STATEMENTS.join(" ");
    expect(text).toMatch(/earns a share/);
    expect(text).toMatch(/nothing extra/);
    expect(text).toMatch(/sealed and private/);
    expect(text).not.toMatch(/—|\bfree\b/i);
  });
});

describe("share", () => {
  it("reads the config with the decided defaults", () => {
    expect(shareConfigFrom(null)).toEqual({ rate: 0.25, months: 12 });
    expect(shareConfigFrom({ rate: 0.3, months: 6 })).toEqual({ rate: 0.3, months: 6 });
    expect(shareConfigFrom({ rate: 5, months: 0 })).toEqual({ rate: 0.25, months: 12 });
    expect(shareConfigFrom({ rate: "0.2", months: "9" })).toEqual({ rate: 0.2, months: 9 });
  });
  it("states the share plainly", () => {
    expect(shareSentence(0.25, 12)).toBe("You earn 25 percent of the membership revenue from each member you refer, for 12 months from their first payment.");
  });
});

describe("recommendations", () => {
  it("allows three, no duplicates", () => {
    let list: string[] = [];
    for (const id of ["a", "b", "c"]) {
      const r = addRecommendation(list, id);
      expect(r.ok).toBe(true);
      list = r.list;
    }
    expect(addRecommendation(list, "d")).toEqual({ list: ["a", "b", "c"], ok: false, reason: "full" });
    expect(addRecommendation(list, "b")).toEqual({ list: ["a", "b", "c"], ok: false, reason: "already" });
    expect(removeRecommendation(list, "b")).toEqual(["a", "c"]);
  });
  it("offers to recommend back only authors not already recommended", () => {
    const rows: RecommendationRow[] = [
      { direction: "recommends", orgId: "o1", name: "One", slug: "one" },
      { direction: "recommended_by", orgId: "o1", name: "One", slug: "one" },
      { direction: "recommended_by", orgId: "o2", name: "Two", slug: "two" },
    ];
    expect(recommendBackCandidates(rows).map((r) => r.orgId)).toEqual(["o2"]);
  });
});
