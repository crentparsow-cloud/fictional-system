import type { ContinueCard } from "@/lib/catalogue-types";

/**
 * Pure helpers for Home and Today (F-016). No streaks, no missed-day counts,
 * nothing that compares one day with the next (F-018).
 */

/** How many continue cards Home and Today show before "See all in Library". */
export const CONTINUE_CAP = 3;

export function splitContinueCards<T>(cards: readonly T[], cap = CONTINUE_CAP): { shown: T[]; hidden: number } {
  return { shown: cards.slice(0, cap), hidden: Math.max(0, cards.length - cap) };
}

/** Only workbooks that carry a daily check get the daily prompt, so a finance reader never sees a mood question. */
export function withDailyCheck(cards: readonly ContinueCard[]): ContinueCard[] {
  return cards.filter((c) => c.hasDailyCheck);
}

export type ContinueStatus =
  | { kind: "startedToday" }
  | { kind: "unit"; unit: number; count: number; unitLabel: ContinueCard["unitLabel"] }
  | { kind: "inProgress" };

/**
 * One line of status per card. "Started today" on the first day before any
 * unit beyond the first is opened, otherwise "Week 2 of 6" when the counts
 * are known, otherwise a plain "In progress".
 */
export function continueStatus(card: Pick<ContinueCard, "startedAt" | "unitCount" | "currentUnit" | "unitLabel">, now: Date = new Date()): ContinueStatus {
  const started = new Date(card.startedAt);
  const sameDay = started.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
  if (sameDay && (card.currentUnit ?? 1) <= 1) return { kind: "startedToday" };
  if (card.unitCount && card.unitCount > 0) {
    const unit = Math.min(Math.max(card.currentUnit ?? 1, 1), card.unitCount);
    return { kind: "unit", unit, count: card.unitCount, unitLabel: card.unitLabel };
  }
  return { kind: "inProgress" };
}

/** True when any shown card is a wellbeing-tier workbook, so Help now sits at the top of the page. */
export function anyWellbeing(cards: readonly Pick<ContinueCard, "safetyTier">[]): boolean {
  return cards.some((c) => c.safetyTier !== "none");
}
