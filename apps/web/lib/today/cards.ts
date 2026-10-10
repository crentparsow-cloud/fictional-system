import type { ProgrammeStep } from "@/lib/today/steps";
import type { UnitWord } from "@/lib/today/week";

/**
 * Which cards Today shows (4.1): three at most. Today's step, one from the
 * reader's toolkit, one suggestion. For the first 30 days of a membership the
 * third card is the next programme to try. No streak, no count of days, no
 * "you missed". The choice is a pure function so it can be tested.
 */

export const MAX_TODAY_CARDS = 3;
export const NEW_MEMBER_DAYS = 30;
const DAY_MS = 86_400_000;

export type SuggestionKind = "related" | "start_here" | "next_programme";

export interface Suggestion {
  kind: SuggestionKind;
  slug: string;
  title: string;
  line: string;
}

export interface ProgrammeToday {
  enrolmentId: string;
  slug: string;
  title: string;
  safetyTier: "none" | "standard" | "higher";
  lastOpenedAt: string;
  unitWord: UnitWord;
  unitCount: number | null;
  /** The next unfinished step, or null when every step is done or none can be read. */
  next: ProgrammeStep | null;
}

export interface SavedTool {
  enrolmentId: string;
  toolId: string;
  title: string;
  minutes: number | null;
}

export type TodayCard =
  | { kind: "step"; programme: ProgrammeToday; step: ProgrammeStep }
  | { kind: "tool"; tool: SavedTool }
  | { kind: "suggestion"; suggestion: Suggestion };

export interface TodayInput {
  now: Date;
  programmes: readonly ProgrammeToday[];
  savedTools: readonly SavedTool[];
  suggestions: readonly Suggestion[];
  /** When the reader's membership began, or null if they have none. */
  membershipStartedAt: Date | null;
}

/** True within the first 30 days of a membership. Never shown to the reader as a number. */
export function inNewMemberWindow(startedAt: Date | null, now: Date): boolean {
  if (!startedAt) return false;
  const age = now.getTime() - startedAt.getTime();
  return age >= 0 && age < NEW_MEMBER_DAYS * DAY_MS;
}

/** A wellbeing reader is anyone with an open title in the standard or higher tier. */
export function isWellbeingReader(programmes: readonly Pick<ProgrammeToday, "safetyTier">[]): boolean {
  return programmes.some((p) => p.safetyTier !== "none");
}

/** The programme whose step leads Today: the most recently opened one that has a step to do. */
export function leadProgramme(programmes: readonly ProgrammeToday[]): ProgrammeToday | null {
  const withStep = programmes.filter((p) => p.next);
  withStep.sort((a, b) => Date.parse(b.lastOpenedAt) - Date.parse(a.lastOpenedAt));
  return withStep[0] ?? null;
}

export function selectTodayCards(input: TodayInput): TodayCard[] {
  const cards: TodayCard[] = [];

  const lead = leadProgramme(input.programmes);
  if (lead?.next) cards.push({ kind: "step", programme: lead, step: lead.next });

  if (input.savedTools.length) {
    // One saved card at a time, changing with the date so the same one is not always first.
    const day = Math.floor(input.now.getTime() / DAY_MS);
    const tool = input.savedTools[day % input.savedTools.length];
    if (tool) cards.push({ kind: "tool", tool });
  }

  // The new-member variant is switched off for anyone with a wellbeing title open.
  const newMember = inNewMemberWindow(input.membershipStartedAt, input.now) && !isWellbeingReader(input.programmes);
  const order: SuggestionKind[] = newMember ? ["next_programme", "related", "start_here"] : ["related", "start_here", "next_programme"];
  for (const kind of order) {
    const suggestion = input.suggestions.find((s) => s.kind === kind);
    if (suggestion) {
      cards.push({ kind: "suggestion", suggestion });
      break;
    }
  }

  return cards.slice(0, MAX_TODAY_CARDS);
}
