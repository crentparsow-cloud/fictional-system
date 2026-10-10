import { describe, expect, it } from "vitest";
import { inNewMemberWindow, isWellbeingReader, MAX_TODAY_CARDS, selectTodayCards, type ProgrammeToday, type SavedTool, type Suggestion } from "@/lib/today/cards";
import { step } from "@/lib/today/fixtures";

const now = new Date("2026-10-10T09:00:00Z");
const programme = (id: string, over: Partial<ProgrammeToday> = {}): ProgrammeToday => ({
  enrolmentId: id,
  slug: `wb-${id}`,
  title: `Workbook ${id}`,
  safetyTier: "none",
  lastOpenedAt: "2026-10-09T09:00:00Z",
  unitWord: "week",
  unitCount: 8,
  next: step(3, "ex"),
  ...over,
});
const tool = (id: string): SavedTool => ({ enrolmentId: "e1", toolId: id, title: `Tool ${id}`, minutes: 3 });
const sug = (kind: Suggestion["kind"]): Suggestion => ({ kind, slug: kind, title: kind, line: "line" });
const all = [sug("related"), sug("next_programme"), sug("start_here")];

describe("selectTodayCards", () => {
  it("shows today's step, one saved tool and one suggestion, three at most", () => {
    const cards = selectTodayCards({ now, programmes: [programme("e1")], savedTools: [tool("a"), tool("b")], suggestions: all, membershipStartedAt: null });
    expect(cards.map((c) => c.kind)).toEqual(["step", "tool", "suggestion"]);
    expect(cards.length).toBeLessThanOrEqual(MAX_TODAY_CARDS);
  });

  it("leads with the programme opened most recently that still has a step", () => {
    const cards = selectTodayCards({
      now,
      programmes: [
        programme("old", { lastOpenedAt: "2026-09-01T00:00:00Z" }),
        programme("done", { lastOpenedAt: "2026-10-10T08:00:00Z", next: null }),
        programme("recent", { lastOpenedAt: "2026-10-09T00:00:00Z" }),
      ],
      savedTools: [],
      suggestions: [],
      membershipStartedAt: null,
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ kind: "step", programme: { enrolmentId: "recent" } });
  });

  it("leaves out the toolkit card when nothing is saved", () => {
    const cards = selectTodayCards({ now, programmes: [programme("e1")], savedTools: [], suggestions: all, membershipStartedAt: null });
    expect(cards.map((c) => c.kind)).toEqual(["step", "suggestion"]);
  });

  it("changes the saved tool with the date, so one card is not always first", () => {
    const pick = (day: string) => {
      const c = selectTodayCards({ now: new Date(day), programmes: [], savedTools: [tool("a"), tool("b"), tool("c")], suggestions: [], membershipStartedAt: null });
      return c[0]?.kind === "tool" ? c[0].tool.toolId : null;
    };
    expect(new Set([pick("2026-10-10T09:00:00Z"), pick("2026-10-11T09:00:00Z"), pick("2026-10-12T09:00:00Z")]).size).toBe(3);
  });

  it("prefers a related title in the ordinary case", () => {
    const cards = selectTodayCards({ now, programmes: [programme("e1")], savedTools: [], suggestions: all, membershipStartedAt: new Date("2026-06-01T00:00:00Z") });
    expect(cards[1]).toMatchObject({ kind: "suggestion", suggestion: { kind: "related" } });
  });

  it("falls back to a start-here title when nothing is related", () => {
    const cards = selectTodayCards({ now, programmes: [programme("e1")], savedTools: [], suggestions: [sug("start_here")], membershipStartedAt: null });
    expect(cards[1]).toMatchObject({ suggestion: { kind: "start_here" } });
  });

  it("makes the third card the next programme for the first 30 days of a membership", () => {
    const cards = selectTodayCards({ now, programmes: [programme("e1")], savedTools: [tool("a")], suggestions: all, membershipStartedAt: new Date("2026-09-25T00:00:00Z") });
    expect(cards[2]).toMatchObject({ kind: "suggestion", suggestion: { kind: "next_programme" } });
  });

  it("goes back to the ordinary third card once the 30 days are over", () => {
    expect(inNewMemberWindow(new Date("2026-09-10T08:59:00Z"), now)).toBe(false);
    expect(inNewMemberWindow(new Date("2026-09-10T09:01:00Z"), now)).toBe(true);
    expect(inNewMemberWindow(null, now)).toBe(false);
  });

  it("does not use the new-member card for a reader with a wellbeing title open", () => {
    const cards = selectTodayCards({
      now,
      programmes: [programme("e1", { safetyTier: "standard" })],
      savedTools: [],
      suggestions: all,
      membershipStartedAt: new Date("2026-09-25T00:00:00Z"),
    });
    expect(isWellbeingReader([{ safetyTier: "standard" }])).toBe(true);
    expect(cards[1]).toMatchObject({ suggestion: { kind: "related" } });
  });

  it("is empty for a reader with nothing to show", () => {
    expect(selectTodayCards({ now, programmes: [], savedTools: [], suggestions: [], membershipStartedAt: null })).toEqual([]);
  });

  it("carries no counts of days or streaks in any card", () => {
    const cards = selectTodayCards({ now, programmes: [programme("e1")], savedTools: [tool("a")], suggestions: all, membershipStartedAt: new Date("2026-09-25T00:00:00Z") });
    expect(JSON.stringify(cards).toLowerCase()).not.toMatch(/streak|daysin|missed|counter/);
  });
});
