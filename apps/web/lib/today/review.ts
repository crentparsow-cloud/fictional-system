import type { ProgrammeStep } from "@/lib/today/steps";

/**
 * Daily review of the reader's own words (4.3). Answers are sealed, so the
 * choice is made in two parts. First a list of answer ids with no content,
 * worked out from the programme's shape and the answer rows' field names and
 * dates (this file, and the daily job). Then only the one chosen answer is
 * unsealed, for its owner, to show on Today. The server never reads the other
 * answers' content to decide anything.
 *
 * Reader controls: a frequency dial per programme (off, rarely, sometimes,
 * often), and two soft actions on any answer, keep and set aside. Neither
 * deletes anything.
 */

export const REVIEW_FREQUENCIES = ["off", "rarely", "sometimes", "often"] as const;
export type ReviewFrequency = (typeof REVIEW_FREQUENCIES)[number];

/** Days in seven on which a programme may feed the review. */
export const DAYS_PER_WEEK: Record<ReviewFrequency, number> = { off: 0, rarely: 1, sometimes: 3, often: 7 };

/** An answer must be at least this old to come back, so "earlier" means earlier. */
export const MIN_AGE_DAYS = 7;
/** An answer shown in the last 30 days is not chosen again. */
export const REST_DAYS = 30;
const DAY_MS = 86_400_000;

export function isReviewFrequency(v: unknown): v is ReviewFrequency {
  return typeof v === "string" && (REVIEW_FREQUENCIES as readonly string[]).includes(v);
}

/** Wellbeing titles (tier standard or higher) are off until the reader turns the review on. */
export function effectiveFrequency(set: ReviewFrequency | null | undefined, safetyTier: "none" | "standard" | "higher"): ReviewFrequency {
  if (set) return set;
  return safetyTier === "none" ? "sometimes" : "off";
}

/** Small stable hash (FNV-1a, 32 bit). Not security, only a repeatable spread. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Does this programme's dial allow a review on this day? Same answer every time for the same day. */
export function dialAllowsDay(frequency: ReviewFrequency, userId: string, enrolmentId: string, day: string): boolean {
  const k = DAYS_PER_WEEK[frequency];
  if (k <= 0) return false;
  if (k >= 7) return true;
  return hash32(`${userId}|${enrolmentId}|${day}`) % 7 < k;
}

const TEXT_TYPES = new Set(["short_text", "long_text"]);

/**
 * Field paths ("exercise:plan.what") that may come back: free-text fields of
 * a plain exercise, not marked sensitive. A field the author marked as hard
 * to write never resurfaces.
 */
export function reviewableFields(steps: readonly ProgrammeStep[]): Map<string, { label: string; unit: number }> {
  const out = new Map<string, { label: string; unit: number }>();
  for (const s of steps) {
    for (const f of s.fields) {
      if (!TEXT_TYPES.has(f.type) || f.sensitive || !f.label) continue;
      out.set(`exercise:${s.exerciseId}.${f.id}`, { label: f.label, unit: s.unit });
    }
  }
  return out;
}

export interface AnswerRef {
  id: string;
  enrolmentId: string;
  field: string;
  updatedAt: string;
}

export interface ReviewPlanInput {
  userId: string;
  /** YYYY-MM-DD in the reader's day. */
  day: string;
  now: Date;
  /** Programmes that feed the review, with their frequency already resolved. */
  programmes: readonly { enrolmentId: string; frequency: ReviewFrequency; reviewable: ReadonlyMap<string, unknown> }[];
  answers: readonly AnswerRef[];
  setAside: ReadonlySet<string>;
  /** Answer ids shown in the last REST_DAYS. */
  recentlyShown: ReadonlySet<string>;
}

/**
 * The ids that could be shown today: from a programme whose dial allows the
 * day, a reviewable field, old enough, not set aside, not shown lately.
 */
export function reviewCandidates(input: ReviewPlanInput): AnswerRef[] {
  const open = new Map(
    input.programmes.filter((p) => dialAllowsDay(p.frequency, input.userId, p.enrolmentId, input.day)).map((p) => [p.enrolmentId, p.reviewable] as const),
  );
  const cutoff = input.now.getTime() - MIN_AGE_DAYS * DAY_MS;
  return input.answers
    .filter((a) => {
      const reviewable = open.get(a.enrolmentId);
      if (!reviewable?.has(a.field)) return false;
      if (input.setAside.has(a.id) || input.recentlyShown.has(a.id)) return false;
      const t = Date.parse(a.updatedAt);
      return !Number.isNaN(t) && t <= cutoff;
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** One candidate for the day, chosen by a stable hash so a reload shows the same answer. */
export function pickForDay(candidates: readonly AnswerRef[], userId: string, day: string): AnswerRef | null {
  if (!candidates.length) return null;
  return candidates[hash32(`${userId}|${day}|review`) % candidates.length] ?? null;
}

/** Next in line if the first pick opens to nothing worth showing. */
export function pickFallbacks(candidates: readonly AnswerRef[], first: AnswerRef | null, limit = 4): AnswerRef[] {
  if (!first) return [];
  const at = candidates.findIndex((c) => c.id === first.id);
  const out: AnswerRef[] = [];
  for (let i = 1; i <= Math.min(limit, candidates.length - 1); i++) {
    const c = candidates[(at + i) % candidates.length];
    if (c) out.push(c);
  }
  return out;
}

/** The text of an unsealed text answer worth showing, or null for blank or too short. */
export function reviewText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length >= 3 ? t.slice(0, 600) : null;
}

/** The field path a "still true?" answer is saved under: its own scope, one per programme per day. */
export function stillTrueField(day: string): string {
  return `review:${day}.still_true`;
}

export const STILL_TRUE_CHOICES = ["yes", "no"] as const;
export type StillTrue = (typeof STILL_TRUE_CHOICES)[number];
