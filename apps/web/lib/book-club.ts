import type { LibraryCard } from "@/lib/catalogue-types";

/**
 * The Book Club Hub and the "Run this with your book club" page (14.16).
 *
 * Every page here is built from what the programme page already shows to
 * anyone: the title, the card line and the outline focus lines. Nothing from
 * inside a unit, and never an answer. A reader's answers stay private, so the
 * ground rules say each person shares only what they choose.
 *
 * Eligible: a live, non-demo programme with a published first unit and no
 * wellbeing tier. A group is the wrong place for a mental health workbook, so
 * tier standard and higher never appear here.
 */

export function bookClubEligible(card: Pick<LibraryCard, "isDemo" | "hasVersion" | "safetyTier">): boolean {
  return !card.isDemo && card.hasVersion && card.safetyTier === "none";
}

export const bookClubPath = (slug: string): string => `/book-clubs/${slug}`;

export interface OutlineUnit {
  number: number;
  focus: string;
}

export interface Meeting {
  number: number;
  /** The units covered at this meeting, in order. */
  units: OutlineUnit[];
}

/** One unit a meeting up to 8 units; two a meeting beyond that, so no club meets for more than 6 months of weeks. */
export function defaultPerMeeting(unitCount: number): 1 | 2 {
  return unitCount <= 8 ? 1 : 2;
}

/** The outline grouped into meetings. Units are kept in order and sorted by number. */
export function meetingPlan(outline: readonly OutlineUnit[], perMeeting: number = defaultPerMeeting(outline.length)): Meeting[] {
  const per = Math.max(1, Math.floor(perMeeting));
  const sorted = [...outline].filter((u) => u.focus.trim()).sort((a, b) => a.number - b.number);
  const meetings: Meeting[] = [];
  for (let i = 0; i < sorted.length; i += per) meetings.push({ number: meetings.length + 1, units: sorted.slice(i, i + per) });
  return meetings;
}

/** "Meeting 3: Week 3" or "Meeting 5: Weeks 9 and 10". */
export function meetingLabel(m: Meeting, unitWord: string): string {
  const nums = m.units.map((u) => u.number);
  const word = unitWord.toLowerCase();
  const cap = word.charAt(0).toUpperCase() + word.slice(1);
  const covers = nums.length <= 1 ? `${cap} ${nums[0] ?? ""}` : `${cap}s ${nums.slice(0, -1).join(", ")} and ${nums[nums.length - 1]}`;
  return `Meeting ${m.number}: ${covers.trim()}`;
}

/** "6 meetings" or "1 meeting". */
export function meetingCount(n: number): string {
  return n === 1 ? "1 meeting" : `${n} meetings`;
}

/** The same four questions for any programme. They ask about the experience, never for an answer. */
export const DISCUSSION_PROMPTS: readonly string[] = [
  "What did you try this time, and what happened when you did?",
  "Which part was easy, and which part did you put off?",
  "What would you tell someone starting this unit tomorrow?",
  "What will you do differently before we meet again?",
];

/** Ground rules a leader reads out at the first meeting. */
export const GROUND_RULES: readonly string[] = [
  "Everyone keeps their own answers private. Nobody is asked to read out what they wrote.",
  "Share what you want to, and pass on the rest without giving a reason.",
  "What is said in the group stays in the group.",
  "Each person works at their own pace. Meeting twice on the same unit is fine.",
];

/** The steps for running it, in order. No claim about outcomes. */
export const RUN_STEPS: readonly string[] = [
  "Choose a day and a place. Meet weekly, or every two weeks if the group prefers.",
  "Ask everyone to start the first unit before the first meeting. It is free.",
  "Open each meeting by reading the ground rules. Then use the questions below.",
  "Close by asking each person what they will do before the next meeting.",
];
