import { describe, expect, it } from "vitest";
import { feelingWord, groupBySteps, isFeeling, parsePayload, shouldOffer, thenAndNow, FEELINGS, type Entry } from "./then-now";

const e = (id: string, stepRef: string, feeling: Entry["feeling"], takenAt: string, extra: Partial<Entry> = {}): Entry => ({
  id,
  enrolmentId: "en1",
  stepRef,
  step: "Name the worry",
  book: "A Book",
  feeling,
  takenAt,
  ...extra,
});

describe("feelings", () => {
  it("has five plain words from low to high", () => {
    expect(FEELINGS.map((f) => f.value)).toEqual([1, 2, 3, 4, 5]);
    expect(feelingWord(2)).toBe("Low");
    expect(feelingWord(9)).toBe("");
    expect(isFeeling(5)).toBe(true);
    expect(isFeeling(0)).toBe(false);
    expect(isFeeling(2.5)).toBe(false);
    expect(isFeeling("3")).toBe(false);
  });
  it("uses no emoji and no dash in the words", () => {
    for (const f of FEELINGS) expect(f.word).toMatch(/^[A-Za-z]+$/);
  });
});

describe("parsePayload", () => {
  it("keeps a feeling and a short step title", () => {
    expect(parsePayload({ feeling: 3, step: "Name the worry" })).toEqual({ feeling: 3, step: "Name the worry" });
    expect(parsePayload({ feeling: 3, step: "x".repeat(500) })?.step).toHaveLength(120);
  });
  it("refuses anything else", () => {
    expect(parsePayload({ feeling: 7 })).toBeNull();
    expect(parsePayload(null)).toBeNull();
    expect(parsePayload("3")).toBeNull();
    expect(parsePayload({ feeling: 2 })).toEqual({ feeling: 2, step: "" });
  });
});

describe("groupBySteps", () => {
  const entries = [
    e("a", "s1", 2, "2026-10-01T09:00:00Z"),
    e("b", "s2", 4, "2026-10-03T09:00:00Z", { step: "Plan a first step" }),
    e("c", "s1", 4, "2026-10-05T09:00:00Z"),
    e("d", "s1", 3, "2026-10-02T09:00:00Z"),
  ];
  it("groups by step, oldest first inside a group, newest group first", () => {
    const g = groupBySteps(entries);
    expect(g.map((x) => x.entries.map((y) => y.id))).toEqual([["a", "d", "c"], ["b"]]);
    expect(g[0]!.step).toBe("Name the worry");
  });
  it("keeps the same step in two books apart", () => {
    const g = groupBySteps([e("a", "s1", 2, "2026-10-01T09:00:00Z"), e("b", "s1", 4, "2026-10-02T09:00:00Z", { enrolmentId: "en2" })]);
    expect(g).toHaveLength(2);
  });
  it("takes a title from a later entry when the first had none", () => {
    const g = groupBySteps([e("a", "s1", 2, "2026-10-01T09:00:00Z", { step: "" }), e("b", "s1", 4, "2026-10-02T09:00:00Z")]);
    expect(g[0]!.step).toBe("Name the worry");
  });
  it("handles none", () => {
    expect(groupBySteps([])).toEqual([]);
  });
});

describe("thenAndNow", () => {
  it("gives the first and latest in words, with no verdict", () => {
    const g = groupBySteps([e("a", "s1", 2, "2026-10-01T09:00:00Z"), e("b", "s1", 5, "2026-10-09T09:00:00Z"), e("c", "s1", 1, "2026-10-12T09:00:00Z")])[0]!;
    expect(thenAndNow(g)).toBe("Then: low. Now: drained.");
  });
  it("gives nothing for a single entry", () => {
    expect(thenAndNow(groupBySteps([e("a", "s1", 2, "2026-10-01T09:00:00Z")])[0]!)).toBeNull();
  });
});

describe("shouldOffer", () => {
  const base = { enabled: true, stepRef: "s1", askedFor: new Set<string>(), readOnly: false };
  it("offers once per step when it is switched on", () => {
    expect(shouldOffer(base)).toBe(true);
    expect(shouldOffer({ ...base, askedFor: new Set(["s1"]) })).toBe(false);
  });
  it("never offers when off, read only, or with no step open", () => {
    expect(shouldOffer({ ...base, enabled: false })).toBe(false);
    expect(shouldOffer({ ...base, readOnly: true })).toBe(false);
    expect(shouldOffer({ ...base, stepRef: null })).toBe(false);
  });
});
