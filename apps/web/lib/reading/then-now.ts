/**
 * "Then and now" (3.10). A one tap check-in before a step: how the reader is
 * arriving, on five plain words. It is a feeling, so it is sealed, never
 * counted, never compared across days and never used for a streak. The You
 * tab shows the reader their own entries, step by step, and each can be
 * deleted.
 */

export interface Feeling {
  value: 1 | 2 | 3 | 4 | 5;
  word: string;
}

/** Five words, low to high. Neutral about the step, kind about every answer. */
export const FEELINGS: readonly Feeling[] = [
  { value: 1, word: "Drained" },
  { value: 2, word: "Low" },
  { value: 3, word: "Steady" },
  { value: 4, word: "Good" },
  { value: 5, word: "Bright" },
];

export const feelingWord = (v: number): string => FEELINGS.find((f) => f.value === v)?.word ?? "";
export const isFeeling = (v: unknown): v is Feeling["value"] => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5;

export const MAX_STEP_TITLE = 120;

/** What is sealed for one entry. */
export interface ThenNowPayload {
  feeling: Feeling["value"];
  step: string;
}

export function parsePayload(raw: unknown): ThenNowPayload | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as { feeling?: unknown; step?: unknown };
  if (!isFeeling(o.feeling)) return null;
  return { feeling: o.feeling, step: typeof o.step === "string" ? o.step.slice(0, MAX_STEP_TITLE) : "" };
}

export interface Entry {
  id: string;
  enrolmentId: string;
  stepRef: string;
  step: string;
  book: string;
  feeling: Feeling["value"];
  takenAt: string;
}

export interface StepHistory {
  key: string;
  book: string;
  step: string;
  /** Oldest first. */
  entries: Entry[];
}

/** Group entries by book and step, each group oldest first, groups with the newest entry first. */
export function groupBySteps(entries: readonly Entry[]): StepHistory[] {
  const groups = new Map<string, StepHistory>();
  for (const e of entries) {
    const key = `${e.enrolmentId}:${e.stepRef}`;
    const g = groups.get(key) ?? { key, book: e.book, step: e.step, entries: [] };
    g.entries.push(e);
    if (!g.step && e.step) g.step = e.step;
    groups.set(key, g);
  }
  const out = [...groups.values()];
  for (const g of out) g.entries.sort((a, b) => Date.parse(a.takenAt) - Date.parse(b.takenAt));
  out.sort((a, b) => Date.parse(b.entries[b.entries.length - 1]!.takenAt) - Date.parse(a.entries[a.entries.length - 1]!.takenAt));
  return out;
}

/**
 * The line for a step with two or more entries: the first and the latest, in
 * the reader's own words for them. No arrow of better or worse, no score.
 */
export function thenAndNow(g: StepHistory): string | null {
  if (g.entries.length < 2) return null;
  const first = g.entries[0]!;
  const last = g.entries[g.entries.length - 1]!;
  return `Then: ${feelingWord(first.feeling).toLowerCase()}. Now: ${feelingWord(last.feeling).toLowerCase()}.`;
}

/** Offer the check-in once for each step on each visit. */
export function shouldOffer(args: { enabled: boolean; stepRef: string | null; askedFor: ReadonlySet<string>; readOnly: boolean }): boolean {
  return args.enabled && !args.readOnly && args.stepRef !== null && !args.askedFor.has(args.stepRef);
}
