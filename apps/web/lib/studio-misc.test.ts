import { describe, expect, it } from "vitest";
import { programmeCounts, programmeLines, earningsLines } from "./studio-home";
import { httpsOnly, onboardingConfig, parseQaDates, parseVideos } from "./studio-onboarding";
import { parseQuestionForm, resultsView } from "./programme-question";
import { generateOutline, parseIdeas, parseOutlineAnswers, splitEvenly, readStoredOutline, outlineToBuilderUnits } from "./studio-outline";

describe("studio home", () => {
  it("hides counts under 10 and counts by status", () => {
    const rows = [
      { workbook_id: "a", code: "A", title: "B", status: "live", is_demo: false, started: 3, finished: 0 },
      { workbook_id: "b", code: "B", title: "A", status: "live", is_demo: false, started: 40, finished: 12 },
      { workbook_id: "c", code: "C", title: "C", status: "draft", is_demo: false, started: null, finished: null },
    ];
    const lines = programmeLines(rows);
    expect(lines[0]?.title).toBe("A");
    expect(lines.find((l) => l.id === "c")?.started).toMatch(/Fewer than 10/);
    expect(programmeCounts(rows)).toMatchObject({ total: 3, live: 2, draft: 1 });
  });
  it("lists live before test earnings", () => {
    const l = earningsLines([
      { currency: "GBP", livemode: false, balance_minor: 100, payable_minor: 0, pending_payout_minor: 0 },
      { currency: "GBP", livemode: true, balance_minor: 250, payable_minor: 0, pending_payout_minor: 0 },
    ]);
    expect(l[0]?.key).toBe("GBP-live");
    expect(l[1]?.label).toContain("test");
  });
});

describe("onboarding config", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  it("is empty while blank", () => {
    expect(onboardingConfig({}, now)).toEqual({ qaDates: [], qaUrl: null, videos: [] });
  });
  it("keeps future dates only, soonest first", () => {
    const d = parseQaDates("2026-03-01T18:00:00Z, 2025-01-01T00:00:00Z, nonsense, 2026-02-01T18:00:00Z", now);
    expect(d.map((x) => x.iso.slice(0, 10))).toEqual(["2026-02-01", "2026-03-01"]);
  });
  it("accepts https links only", () => {
    expect(httpsOnly("http://x.com")).toBeNull();
    expect(httpsOnly("javascript:alert(1)")).toBeNull();
    expect(parseVideos('[{"title":"A","url":"https://x.com/v"},{"title":"B","url":"http://x.com"}]')).toEqual([{ title: "A", url: "https://x.com/v" }]);
    expect(parseVideos("not json")).toEqual([]);
  });
});

describe("programme question", () => {
  it("clears when empty", () => {
    expect(parseQuestionForm("", ["", ""])).toEqual({ ok: true, value: null });
  });
  it("needs a question mark and distinct answers", () => {
    expect(parseQuestionForm("How did it go", ["a", "b"]).ok).toBe(false);
    expect(parseQuestionForm("How did it go?", ["a", "A"]).ok).toBe(false);
    expect(parseQuestionForm("How did it go?", ["a"]).ok).toBe(false);
    expect(parseQuestionForm("How did it go?", ["Well", "Badly"])).toMatchObject({ ok: true });
  });
  it("keeps suppressed cells hidden", () => {
    const v = resultsView([
      { option_index: 0, label: "A", n: null, total: null, suppressed: true },
      { option_index: 1, label: "B", n: null, total: null, suppressed: true },
    ]);
    expect(v.lines.every((l) => l.count.startsWith("Fewer than") && l.share === "")).toBe(true);
    const w = resultsView([
      { option_index: 0, label: "A", n: 15, total: 20, suppressed: false },
      { option_index: 1, label: "B", n: null, total: 20, suppressed: true },
    ]);
    expect(w.lines[0]?.share).toBe("75%");
    expect(w.lines[1]?.share).toBe("");
  });
});

describe("outline generator", () => {
  const answers = { outcome: "Plan a week", reader: "Busy parents", unitKind: "week" as const, unitCount: 6, ideas: ["Sleep", "Food", "Move"], pace: "two" as const };
  it("is deterministic and has the right shape", () => {
    const a = generateOutline(answers);
    expect(a).toEqual(generateOutline(answers));
    expect(a.units).toHaveLength(6);
    expect(a.units[0]?.role).toBe("start");
    expect(a.units[5]?.role).toBe("close");
    expect(a.units.filter((u) => u.role === "practice").length).toBe(1);
    expect(a.units.every((u) => u.exercises === 2)).toBe(true);
  });
  it("shares ideas when there are more ideas than units", () => {
    const o = generateOutline({ ...answers, unitCount: 3, ideas: ["a", "b", "c", "d"] });
    expect(o.units[1]?.topics).toEqual(["a", "b", "c", "d"]);
    expect(splitEvenly([1, 2, 3, 4, 5], 2)).toEqual([[1, 2, 3], [4, 5]]);
  });
  it("parses answers and ideas", () => {
    expect(parseIdeas("1. Sleep\n- Food\n\nsleep\n")).toEqual(["Sleep", "Food"]);
    expect(parseOutlineAnswers({ outcome: "", reader: "x", unitKind: "week", unitCount: 2, ideas: "a", pace: "one" })).toMatchObject({ ok: false });
    expect(parseOutlineAnswers({ outcome: "Plan well", reader: "Parents", unitKind: "day", unitCount: "5", ideas: "a\nb\nc", pace: "one" })).toMatchObject({ ok: true });
  });
  it("round-trips through storage and into builder units", () => {
    const o = generateOutline(answers);
    expect(readStoredOutline(JSON.stringify(o))).toEqual(o);
    expect(readStoredOutline("{bad")).toBeNull();
    expect(outlineToBuilderUnits(o)).toHaveLength(6);
  });
});
