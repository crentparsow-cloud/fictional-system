import { describe, expect, it } from "vitest";
import { inNewMemberWindow, isWellbeingReader, MAX_TODAY_CARDS, orderProgrammes, selectTodayCards, stepCardWords, stepStatus, type ProgrammeToday, type SavedTool, type Suggestion } from "@/lib/today/cards";
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

describe("pace on Today", () => {
  it("leads with a programme whose pace suggests a part today, never hiding the rest", () => {
    const cards = selectTodayCards({
      now,
      programmes: [
        programme("recent", { lastOpenedAt: "2026-10-10T08:00:00Z", pace: "own_pace", due: false }),
        programme("due", { lastOpenedAt: "2026-10-01T08:00:00Z", pace: "daily", due: true }),
      ],
      savedTools: [],
      suggestions: [],
      membershipStartedAt: null,
    });
    expect(cards[0]?.kind === "step" && cards[0].programme.enrolmentId).toBe("due");
  });

  it("still leads with a programme that is not due when it is the only one with a step", () => {
    const cards = selectTodayCards({ now, programmes: [programme("weekly", { pace: "weekly", due: false })], savedTools: [], suggestions: [], membershipStartedAt: null });
    expect(cards[0]?.kind).toBe("step");
  });
});

describe("every open programme on Today", () => {
  // The signed-in test: Meditations and The Way to Wealth weekly, A Polite No
  // in four parts at three times a week with a step finished today.
  const meditations = programme("med", { title: "Meditations", unitCount: 12, pace: "weekly", due: true, dueDay: "2026-10-10", lastOpenedAt: "2026-10-08T09:00:00Z", next: step(1, "m1") });
  const wealth = programme("wealth", { title: "The Way to Wealth", unitCount: 6, pace: "weekly", due: true, dueDay: "2026-10-05", lastOpenedAt: "2026-10-01T09:00:00Z", next: step(2, "w2") });
  const politeNo = programme("polite", { title: "A Polite No", unitWord: "part", unitCount: 4, pace: "few_times_a_week", due: false, workedToday: true, dueDay: "2026-10-12", lastOpenedAt: "2026-10-10T08:30:00Z", next: step(1, "p2") });

  it("shows a step card for each, the most due first and the one worked on today last", () => {
    const cards = selectTodayCards({ now, programmes: [politeNo, meditations, wealth], savedTools: [tool("a")], suggestions: all, membershipStartedAt: null });
    expect(cards.map((c) => (c.kind === "step" ? c.programme.enrolmentId : c.kind))).toEqual(["wealth", "med", "polite", "tool", "suggestion"]);
  });

  it("puts a due programme before one waiting, and a waiting one before one done today", () => {
    const waiting = programme("waiting", { pace: "own_pace", due: false, dueDay: null, lastOpenedAt: "2026-10-10T08:59:00Z" });
    expect(orderProgrammes([politeNo, waiting, meditations]).map((p) => p.enrolmentId)).toEqual(["med", "waiting", "polite"]);
  });

  it("leaves out a programme with nothing left to do", () => {
    expect(orderProgrammes([{ ...politeNo, next: null }, meditations]).map((p) => p.enrolmentId)).toEqual(["med"]);
  });

  it("says Done for today on a scheduled pace and Next part when you are ready on own pace", () => {
    expect(stepStatus(politeNo)).toBe("done_today");
    expect(stepStatus({ ...politeNo, pace: "own_pace" })).toBe("when_ready");
    expect(stepStatus({ pace: "weekly", due: false, workedToday: false })).toBe("when_ready");
    expect(stepStatus(meditations)).toBe("due");
    expect(stepCardWords(politeNo, 1).status).toBe("Done for today");
    expect(stepCardWords({ ...politeNo, pace: "own_pace" }, 1).status).toBe("Next part when you are ready");
  });

  it("uses part wording for a title in parts and week wording for a weekly title in weeks", () => {
    expect(stepCardWords(politeNo, 1)).toMatchObject({ place: "Part 1 of 4", next: "Your next part" });
    expect(stepCardWords(meditations, 1)).toMatchObject({ place: "Week 1 of 12", next: "Week 1 is next" });
  });
});

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
    expect(cards.map((c) => c.kind === "step" && c.programme.enrolmentId)).toEqual(["recent", "old"]);
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

describe("month-three shared plan card", () => {
  const offer = { headline: "h", body: "b", cta: "c", href: "/pricing#two-people", price: "£11.99 a month for two people" };
  const base = { now: new Date("2026-10-14T09:00:00Z"), programmes: [], savedTools: [], suggestions: [{ kind: "related" as const, slug: "x", title: "X", line: "l" }], membershipStartedAt: new Date("2026-07-14T09:00:00Z") };
  it("takes the third card once it is offered", () => {
    const cards = selectTodayCards({ ...base, monthThreeOffer: offer });
    expect(cards).toEqual([{ kind: "shared_offer", offer }]);
  });
  it("is absent when not offered", () => {
    expect(selectTodayCards({ ...base, monthThreeOffer: null }).some((c) => c.kind === "shared_offer")).toBe(false);
  });
  it("never shows for a reader with a wellbeing title open", () => {
    const programmes = [{ enrolmentId: "e", slug: "s", title: "t", safetyTier: "standard" as const, lastOpenedAt: "2026-10-13T00:00:00Z", unitWord: "week" as const, unitCount: 8, next: null }];
    expect(selectTodayCards({ ...base, programmes, monthThreeOffer: offer }).some((c) => c.kind === "shared_offer")).toBe(false);
  });
});
