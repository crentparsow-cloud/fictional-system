import type { ProgrammeStep } from "@/lib/today/steps";
import { paceUnitLabel, type Pace } from "@/lib/pace";
import type { UnitWord } from "@/lib/today/week";

/**
 * Which cards Today shows (4.1). One step card for every open programme with
 * a step to do, the most due first, then at most one from the reader's
 * toolkit and one suggestion. For the first 30 days of a membership the
 * third card is the next programme to try. No streak, no count of days, no
 * "you missed". The choice is a pure function so it can be tested.
 */

/** One step card, one toolkit card, one suggestion: the cards for a reader with one programme. */
export const MAX_TODAY_CARDS = 3;
/** Cards after the step cards: the toolkit card and the suggestion. */
const MAX_OTHER_CARDS = MAX_TODAY_CARDS - 1;
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
  /** The reader's pace for this programme (0069). Defaults to weekly when left out. */
  pace?: Pace;
  /** True when the pace suggests a part today. Own pace is never due, and nothing ever locks. */
  due?: boolean;
  /** The local day the pace next suggests a part, "YYYY-MM-DD", or null on own pace. Earlier is more due. */
  dueDay?: string | null;
  /** True when the reader finished a step of this programme today. */
  workedToday?: boolean;
}

export interface SavedTool {
  enrolmentId: string;
  toolId: string;
  title: string;
  minutes: number | null;
}

/** The shared-plan offer shown once in month three (5.4, 14.24 follow-on). Wording and price come from the server. */
export interface MonthThreeOffer {
  headline: string;
  body: string;
  cta: string;
  href: string;
  /** The price line from the database, for example "£11.99 a month for two people". */
  price: string;
}

export type TodayCard =
  | { kind: "step"; programme: ProgrammeToday; step: ProgrammeStep }
  | { kind: "tool"; tool: SavedTool }
  | { kind: "suggestion"; suggestion: Suggestion }
  | { kind: "shared_offer"; offer: MonthThreeOffer };

export interface TodayInput {
  now: Date;
  programmes: readonly ProgrammeToday[];
  savedTools: readonly SavedTool[];
  suggestions: readonly Suggestion[];
  /** When the reader's membership began, or null if they have none. */
  membershipStartedAt: Date | null;
  /** Set only in month three of a single membership. It takes the third card. */
  monthThreeOffer?: MonthThreeOffer | null;
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

/**
 * How due a programme is, for ordering Today. Lower comes first: due today
 * (the longest waiting first), then waiting and not touched today, then
 * worked on today.
 */
function dueRank(p: ProgrammeToday): number {
  if (p.due === true) return 0;
  if (p.workedToday === true) return 2;
  return 1;
}

/**
 * Every programme with a step to do, the most due first. Within a rank the
 * earlier due day leads (own pace, with no due day, comes after), then the
 * most recently opened. Nothing that is not due is ever held back.
 */
export function orderProgrammes(programmes: readonly ProgrammeToday[]): ProgrammeToday[] {
  const withStep = programmes.filter((p) => p.next);
  const day = (p: ProgrammeToday) => p.dueDay ?? "9999-12-31";
  return withStep.sort(
    (a, b) => dueRank(a) - dueRank(b) || (day(a) < day(b) ? -1 : day(a) > day(b) ? 1 : 0) || Date.parse(b.lastOpenedAt) - Date.parse(a.lastOpenedAt),
  );
}

/** The programme whose step leads Today: the most due one. */
export function leadProgramme(programmes: readonly ProgrammeToday[]): ProgrammeToday | null {
  return orderProgrammes(programmes)[0] ?? null;
}

export type StepStatus = "due" | "done_today" | "when_ready";

/**
 * Where a programme stands today. Due: its pace suggests a part today.
 * Done for today: a step was finished today on a scheduled pace. Otherwise
 * the next part is there when the reader is ready, which is always the case
 * on own pace.
 */
export function stepStatus(p: Pick<ProgrammeToday, "due" | "workedToday" | "pace">): StepStatus {
  if (p.due === true) return "due";
  if (p.workedToday === true && (p.pace ?? "weekly") !== "own_pace") return "done_today";
  return "when_ready";
}

export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  due: "Today's step",
  done_today: "Done for today",
  when_ready: "Next part when you are ready",
};

/**
 * The words on a step card. A title in weeks read weekly keeps week wording
 * ("Week 1 of 12", "Week 1 is next"); everything else talks about parts
 * ("Part 1 of 4", "Your next part").
 */
export function stepCardWords(p: Pick<ProgrammeToday, "unitWord" | "unitCount" | "pace" | "due" | "workedToday">, unit: number): { place: string; next: string; status: string } {
  const label = paceUnitLabel(p.unitWord, p.pace ?? "weekly");
  const place = p.unitCount && p.unitCount >= unit ? `${label} ${unit} of ${p.unitCount}` : `${label} ${unit}`;
  const next = label === "Part" ? "Your next part" : `${label} ${unit} is next`;
  return { place, next, status: STEP_STATUS_LABEL[stepStatus(p)] };
}

export function selectTodayCards(input: TodayInput): TodayCard[] {
  const cards: TodayCard[] = [];

  const steps: TodayCard[] = [];
  for (const p of orderProgrammes(input.programmes)) if (p.next) steps.push({ kind: "step", programme: p, step: p.next });

  if (input.savedTools.length) {
    // One saved card at a time, changing with the date so the same one is not always first.
    const day = Math.floor(input.now.getTime() / DAY_MS);
    const tool = input.savedTools[day % input.savedTools.length];
    if (tool) cards.push({ kind: "tool", tool });
  }

  // Month three: the shared plan takes the third card once. Never for a wellbeing reader.
  if (input.monthThreeOffer && !isWellbeingReader(input.programmes)) {
    cards.push({ kind: "shared_offer", offer: input.monthThreeOffer });
    return [...steps, ...cards.slice(0, MAX_OTHER_CARDS)];
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

  return [...steps, ...cards.slice(0, MAX_OTHER_CARDS)];
}
