/**
 * The companion that grows (build list 4.6). It draws energy from finished
 * steps and comes back on Today with a line or a question. It never loses
 * anything: the stage comes from the highest step count it has ever seen
 * (the database keeps that mark; migration 0049), it does not wither, and no
 * line mentions time away.
 *
 * It is a small plant. Stages are set by step thresholds in app_config
 * (companion_stage_steps) so they can change without a release.
 */

export const DEFAULT_STAGE_STEPS: readonly number[] = [3, 10, 25, 50, 100, 200];

export const STAGE_NAMES = ["Seed", "Sprout", "Seedling", "Young plant", "Growing plant", "Tall plant", "In full leaf"] as const;

export interface CompanionStage {
  /** 0 is the seed. */
  stage: number;
  name: string;
  /** Steps still to the next stage, or null at the last. Shown as a plain sentence, never a bar to fill. */
  toNext: number | null;
  last: boolean;
}

/** Reads the thresholds from app_config JSON. Falls back to the defaults when the value is not a sorted list of positive whole numbers. */
export function parseStageSteps(value: unknown): readonly number[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > STAGE_NAMES.length - 1) return DEFAULT_STAGE_STEPS;
  const nums = value.map((v) => Number(v));
  const ok = nums.every((n, i) => Number.isInteger(n) && n > 0 && (i === 0 || n > nums[i - 1]!));
  return ok ? nums : DEFAULT_STAGE_STEPS;
}

/** The stage for a step count. Pass the higher of the live count and the stored high-water mark. */
export function companionStage(steps: number, thresholds: readonly number[] = DEFAULT_STAGE_STEPS): CompanionStage {
  const n = Math.max(0, Math.floor(steps));
  const stage = thresholds.filter((t) => n >= t).length;
  const next = thresholds[stage];
  return { stage, name: STAGE_NAMES[Math.min(stage, STAGE_NAMES.length - 1)]!, toNext: next === undefined ? null : next - n, last: next === undefined };
}

/** What the page uses: never below the stored high-water mark. */
export function effectiveSteps(live: number, highWater: number): number {
  return Math.max(Math.floor(live) || 0, Math.floor(highWater) || 0);
}

// ---------------------------------------------------------------------------
// Words. Short, warm, plain. Nothing about days, goals or anything missed.
// ---------------------------------------------------------------------------

export const LINES: readonly string[] = [
  "Good to see you.",
  "Your work is all here, just as you left it.",
  "One small step is enough for today.",
  "I grew a little with your last step.",
  "There is no hurry. I am happy to wait.",
  "You can start anywhere in the programme.",
  "Your answers are yours alone.",
  "A short step is still a step.",
];

export const QUESTIONS: readonly string[] = [
  "What would make today's step feel easy?",
  "Which part of your last step stayed with you?",
  "Is there a small thing you would like to try next?",
  "What is one thing you would like to remember from this programme?",
  "Where could you fit ten quiet minutes?",
  "What did you notice the last time you finished a step?",
];

export const WELCOME_BACK_LINES: readonly string[] = [
  "Welcome back. Everything is where you left it.",
  "I am glad you are here. Start wherever feels right.",
  "Nothing has changed. Pick up when you like.",
];

/** A small stable hash, so the same day gives the same words on every refresh. */
export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface CompanionWords {
  kind: "line" | "question";
  text: string;
}

/** One line or one question for the day. A reader coming back after a long time always gets a welcome, with no mention of how long. */
export function companionWords(seed: string, opts: { returning?: boolean } = {}): CompanionWords {
  const h = hashSeed(seed);
  if (opts.returning) return { kind: "line", text: WELCOME_BACK_LINES[h % WELCOME_BACK_LINES.length]! };
  if (h % 3 === 0) return { kind: "question", text: QUESTIONS[(h >>> 3) % QUESTIONS.length]! };
  return { kind: "line", text: LINES[(h >>> 3) % LINES.length]! };
}

/** The sentence under the companion about its growth. */
export function growthLine(s: CompanionStage): string {
  if (s.last) return `${s.name}. It has grown as far as it goes, and it keeps everything.`;
  if (s.stage === 0) return `${s.name}. It wakes with your first finished steps.`;
  return `${s.name}. ${s.toNext === 1 ? "One more step" : `${s.toNext} more steps`} help it grow again.`;
}
