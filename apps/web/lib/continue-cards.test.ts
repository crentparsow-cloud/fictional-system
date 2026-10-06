import { describe, expect, it } from "vitest";
import type { ContinueCard } from "./catalogue-types";
import { CONTINUE_CAP, anyWellbeing, continueStatus, splitContinueCards, withDailyCheck } from "./continue-cards";

function card(over: Partial<ContinueCard> & Pick<ContinueCard, "enrolmentId">): ContinueCard {
  return {
    workbookId: "w",
    slug: over.enrolmentId,
    title: "T",
    shortTitle: null,
    badge: "official",
    isDemo: false,
    safetyTier: "none",
    startedAt: "2026-10-01T09:00:00Z",
    lastOpenedAt: "2026-10-06T09:00:00Z",
    unitLabel: "week",
    unitCount: 6,
    currentUnit: 2,
    hasDailyCheck: false,
    ...over,
  };
}

describe("continue cards", () => {
  it("shows only workbooks with a daily check on Today", () => {
    const cards = [card({ enrolmentId: "finance", hasDailyCheck: false }), card({ enrolmentId: "mood", hasDailyCheck: true })];
    expect(withDailyCheck(cards).map((c) => c.enrolmentId)).toEqual(["mood"]);
    expect(withDailyCheck([])).toEqual([]);
  });

  it("caps continue cards at three and counts the rest", () => {
    const cards = [1, 2, 3, 4, 5].map((n) => card({ enrolmentId: String(n) }));
    const { shown, hidden } = splitContinueCards(cards);
    expect(CONTINUE_CAP).toBe(3);
    expect(shown).toHaveLength(3);
    expect(hidden).toBe(2);
    expect(splitContinueCards([]).hidden).toBe(0);
  });

  it("writes one line of status with no streak", () => {
    const now = new Date("2026-10-06T15:00:00Z");
    expect(continueStatus(card({ enrolmentId: "a", startedAt: "2026-10-06T08:00:00Z", currentUnit: null }), now)).toEqual({ kind: "startedToday" });
    expect(continueStatus(card({ enrolmentId: "b", currentUnit: 2 }), now)).toEqual({ kind: "unit", unit: 2, count: 6, unitLabel: "week" });
    expect(continueStatus(card({ enrolmentId: "c", currentUnit: 9 }), now)).toEqual({ kind: "unit", unit: 6, count: 6, unitLabel: "week" });
    expect(continueStatus(card({ enrolmentId: "d", unitCount: null, currentUnit: null }), now)).toEqual({ kind: "inProgress" });
  });

  it("flags Help now when any card is a wellbeing title", () => {
    expect(anyWellbeing([card({ enrolmentId: "a" })])).toBe(false);
    expect(anyWellbeing([card({ enrolmentId: "a" }), card({ enrolmentId: "b", safetyTier: "standard" })])).toBe(true);
  });
});
