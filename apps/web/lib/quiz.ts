import { lengthBucket } from "@/lib/library-grouping";
import type { LengthBucket } from "@/lib/catalogue-types";

/**
 * The onboarding quiz (5.1) as data and one rule. No account is needed; the
 * answers stay on the device (lib/onboarding.ts) and never leave it.
 *
 * Four questions, most engaging first:
 *   1. what is going on for you right now (shelf-shaped answers)
 *   2. what would help most (the Themes on that shelf, from the live catalogue)
 *   3. how much time a day
 *   4. how long a programme
 * Each has a one-line "why we ask". Then three suggested titles and one
 * commitment screen. The rule that picks the titles is recommend(): plain
 * scoring over the catalogue, written so it can be read and tested. It is
 * not a model and it sees nothing but these four answers.
 */

export interface ShelfChoice {
  /** The shelf id the answer points at, or null for "not sure yet". */
  shelfId: string | null;
  label: string;
  /** One short line under the label. */
  hint: string;
}

/**
 * Answers shaped like the shelves. A choice shows only when the live
 * catalogue has a title on that shelf, so nobody is sent to an empty shelf.
 * "Not sure yet" always shows.
 */
export const SHELF_CHOICES: readonly ShelfChoice[] = [
  { shelfId: "mind-and-mood", label: "I feel worried, low or overwhelmed", hint: "Mind and mood" },
  { shelfId: "work-and-career", label: "Work or my career needs attention", hint: "Work and career" },
  { shelfId: "money", label: "Money is on my mind", hint: "Money" },
  { shelfId: "family-and-parenting", label: "Family life is taking a lot of my energy", hint: "Family and parenting" },
  { shelfId: "love-and-relationships", label: "A relationship needs some care", hint: "Love and relationships" },
  { shelfId: "personal-growth", label: "I want better habits or a clearer direction", hint: "Personal growth" },
  { shelfId: "learning-and-skills", label: "I want to learn something properly", hint: "Learning and skills" },
  { shelfId: "health-and-body", label: "I want to look after my body", hint: "Health and body" },
  { shelfId: "faith-and-spirituality", label: "I want to grow in my faith", hint: "Faith and spirituality" },
  { shelfId: "creativity-and-making", label: "I want to write or make something", hint: "Creativity and making" },
  { shelfId: null, label: "I am not sure yet", hint: "Show me a mix" },
];

export const NOT_SURE_THEME = "any";

export type MinutesChoice = 5 | 10 | 20 | 30;
export const MINUTES_CHOICES: readonly { value: MinutesChoice; label: string }[] = [
  { value: 5, label: "About 5 minutes" },
  { value: 10, label: "About 10 minutes" },
  { value: 20, label: "About 20 minutes" },
  { value: 30, label: "30 minutes or more" },
];

export type LengthChoice = LengthBucket | "any";
export const LENGTH_CHOICES: readonly { value: LengthChoice; label: string }[] = [
  { value: "short", label: "Short and focused, up to 4 units" },
  { value: "medium", label: "A few weeks, 5 to 8 units" },
  { value: "long", label: "A longer journey, 9 or more units" },
  { value: "any", label: "No preference" },
];

/** What the reader chose. A field is absent until that question is answered. */
export interface QuizAnswers {
  /** Shelf id, or null for "not sure yet". */
  shelfId?: string | null;
  /** Theme id, or NOT_SURE_THEME. */
  themeId?: string;
  minutes?: MinutesChoice;
  length?: LengthChoice;
}

export const QUIZ_STEPS = ["focus", "theme", "time", "length"] as const;
export type QuizStep = (typeof QUIZ_STEPS)[number];

/** Copy for each question: the question and the one-line reason for asking. */
export const QUIZ_COPY: Record<QuizStep, { question: string; why: string }> = {
  focus: {
    question: "What is going on for you right now?",
    why: "So we can start with the shelf that fits, not a long list.",
  },
  theme: {
    question: "What would help most?",
    why: "This narrows the shelf to the one or two workbooks that match.",
  },
  time: {
    question: "How much time can you give on a usual day?",
    why: "So the first week is realistic and you can finish what you start.",
  },
  length: {
    question: "How long a programme suits you?",
    why: "Some people like a short run, others a longer one. Either is fine.",
  },
};

/**
 * The questions that apply. The Theme question is skipped when the reader is
 * not sure, or when the shelf has fewer than two Themes with a title, so
 * nobody is asked to choose between one thing. Never fewer than three
 * questions; the spec is four to five, and four is the usual case.
 */
export function stepsFor(input: { shelfId?: string | null; themesOnShelf?: number }): QuizStep[] {
  const askTheme = Boolean(input.shelfId) && (input.themesOnShelf ?? 0) >= 2;
  return QUIZ_STEPS.filter((s) => s !== "theme" || askTheme);
}

/** "Step 2 of 4" for the progress bar. The bar fills from step one. */
export function progressOf(step: QuizStep, steps: readonly QuizStep[] = QUIZ_STEPS): { current: number; total: number; percent: number } {
  const current = Math.max(1, steps.indexOf(step) + 1);
  return { current, total: steps.length, percent: Math.round((current / steps.length) * 100) };
}

/** A title the rule can suggest. Plain data, safe to send to the browser. */
export interface QuizCandidate {
  slug: string;
  title: string;
  cardLine: string;
  themeId: string | null;
  themeName: string | null;
  shelfId: string | null;
  isDemo: boolean;
  safetyTier: "none" | "standard" | "higher";
  unitCount: number | null;
  /** From the listing when it says; most titles do not yet. */
  minutesPerDay: number | null;
  /** The first unit exists and is complete (policy 7.9), so it can be started now. */
  hasVersion: boolean;
  /** "Week 1 is free, no card", or null (lib/free-label.ts). */
  freeLabel?: string | null;
}

export interface Suggestion {
  candidate: QuizCandidate;
  score: number;
  /** One title is the one to start now: the best match that can be started signed out. */
  startNow: boolean;
}

const WEIGHT = { shelf: 40, theme: 30, time: 15, timeNear: 5, timeOver: -10, length: 15, lengthNear: 5, real: 3 } as const;

const ORDER: Record<LengthBucket, number> = { short: 0, medium: 1, long: 2 };

/**
 * Score one candidate against the answers. Higher is a better match.
 *   shelf match           +40  (no shelf chosen: nothing)
 *   theme match           +30  (no theme chosen: nothing)
 *   fits the daily time   +15; within half as much again +5; well over -10.
 *                         Skipped when the listing does not say.
 *   length bucket         +15 exact, +5 next to it
 *   not a demo title      +3, only to break a tie
 */
export function scoreCandidate(c: QuizCandidate, a: QuizAnswers): number {
  let score = 0;
  if (a.shelfId && c.shelfId === a.shelfId) score += WEIGHT.shelf;
  if (a.themeId && a.themeId !== NOT_SURE_THEME && c.themeId === a.themeId) score += WEIGHT.theme;
  if (a.minutes && c.minutesPerDay && c.minutesPerDay > 0) {
    if (c.minutesPerDay <= a.minutes) score += WEIGHT.time;
    else if (c.minutesPerDay <= a.minutes * 1.5) score += WEIGHT.timeNear;
    else score += WEIGHT.timeOver;
  }
  if (a.length && a.length !== "any") {
    const bucket = lengthBucket(c.unitCount);
    if (bucket) {
      const gap = Math.abs(ORDER[bucket] - ORDER[a.length]);
      if (gap === 0) score += WEIGHT.length;
      else if (gap === 1) score += WEIGHT.lengthNear;
    }
  }
  if (!c.isDemo) score += WEIGHT.real;
  return score;
}

/** Whether a title can be started with no account. Wellbeing titles ask for consent first, which needs one. */
export function startableSignedOut(c: Pick<QuizCandidate, "hasVersion" | "safetyTier">): boolean {
  return c.hasVersion && c.safetyTier === "none";
}

/**
 * Three suggestions, best first, one marked to start now. A shelf match
 * always outranks anything off the shelf, because the shelf weight is the
 * largest. Ties go to the slug, so the same answers always give the same
 * three.
 *
 * "Start now" goes to the best match that can be started with no account;
 * where none can (every match is a wellbeing title), it goes to the best
 * match and the reader is taken to sign in first. Only titles with a
 * complete first unit are offered at all.
 */
export function recommend(candidates: readonly QuizCandidate[], answers: QuizAnswers, count = 3): Suggestion[] {
  const scored = candidates
    .filter((c) => c.hasVersion)
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate, answers) }))
    .sort((x, y) => y.score - x.score || x.candidate.slug.localeCompare(y.candidate.slug))
    .slice(0, count);
  if (!scored.length) return [];
  const bestStartable = scored.findIndex((s) => startableSignedOut(s.candidate));
  const startIndex = bestStartable >= 0 ? bestStartable : 0;
  return scored.map((s, i) => ({ ...s, startNow: i === startIndex }));
}

/** The shelf choices that have at least one title, "not sure" always last and always there. */
export function availableShelfChoices(shelvesWithTitles: ReadonlySet<string>): ShelfChoice[] {
  return SHELF_CHOICES.filter((c) => c.shelfId === null || shelvesWithTitles.has(c.shelfId));
}

/** The commitment screen's sentence. No deadline, no date, no count of days. */
export const COMMITMENT_LINE = "This week I will do two steps.";
export const COMMITMENT_STEPS = 2;
