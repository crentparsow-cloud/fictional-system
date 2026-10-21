import { describe, expect, it } from "vitest";
import { byLevel, byPrinciple, CRITERIA, tally, VPAT } from "./vpat";

describe("conformance report", () => {
  it("lists every WCAG 2.2 level A and AA criterion once: 31 and 24", () => {
    expect(CRITERIA).toHaveLength(55);
    expect(new Set(CRITERIA.map((x) => x.id)).size).toBe(55);
    expect(byLevel("A")).toHaveLength(31);
    expect(byLevel("AA")).toHaveLength(24);
  });

  it("has the six criteria new in 2.2 and not the retired 4.1.1", () => {
    const ids = CRITERIA.map((x) => x.id);
    for (const id of ["2.4.11", "2.5.7", "2.5.8", "3.2.6", "3.3.7", "3.3.8"]) expect(ids).toContain(id);
    expect(ids).not.toContain("4.1.1");
    expect(ids).not.toContain("2.4.12");
  });

  it("sorts every principle into its own group", () => {
    expect(["1", "2", "3", "4"].map((n) => byPrinciple(n).length)).toEqual([20, 20, 13, 2]);
  });

  it("claims no full support while the manual pass has not been recorded", () => {
    expect(VPAT.manualPass).toBeNull();
    expect(CRITERIA.every((x) => ["Partially supports", "Not applicable", "Not evaluated"].includes(x.status))).toBe(true);
    expect(JSON.stringify([CRITERIA, VPAT])).not.toMatch(/\bSupports\b|fully (conform|compl)|is compliant|are compliant|certified|100%/);
  });

  it("only calls something not applicable when the product has nothing to which it applies", () => {
    const na = CRITERIA.filter((x) => x.status === "Not applicable").map((x) => x.id);
    expect(na).toEqual(["1.2.1", "1.2.2", "1.2.3", "1.2.4", "1.2.5", "1.4.2", "2.5.4"]);
  });

  it("gives every criterion a reason", () => {
    for (const x of CRITERIA) expect(x.remarks.length, x.id).toBeGreaterThan(20);
  });

  it("adds up", () => {
    const t = tally();
    expect(t.partial + t.notApplicable + t.notEvaluated).toBe(t.total);
    expect(t.notEvaluated).toBeGreaterThan(0);
  });

  it("uses house style: no em dashes, no exclamation marks, no emojis", () => {
    const text = JSON.stringify([CRITERIA, VPAT]);
    expect(text).not.toMatch(/—|–/);
    expect(text).not.toMatch(/!/);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
