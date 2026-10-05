import type { Genre, SafetyTier } from "@akana/schema";

/**
 * Rulebook. Ported from legacy/tools/validate.py and made genre and spelling aware.
 * Keep the claim lists conservative and review with Claims Compliance before changing.
 */

export const BANNED_CHARS: Record<string, string> = {
  "—": "em dash",
  "–": "en dash",
  "‒": "figure dash",
  "―": "horizontal bar",
  "“": "curly double quote",
  "”": "curly double quote",
  "‘": "curly single quote",
  "’": "curly single quote",
  "…": "ellipsis character",
};

export const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;

// Claims that imply treatment, diagnosis or a medical outcome. Every genre.
const CLAIM_MEDICAL = [
  String.raw`\btreat(s|ed|ing|ment|ments)?\b`,
  String.raw`\bcure(s|d)?\b`,
  String.raw`\bheal(s|ed|ing)?\b`,
  String.raw`\bdiagnos\w*`,
  String.raw`\bsymptom(s)? (relief|reduction)\b`,
  String.raw`\breduc\w* (your )?symptoms?\b`,
  String.raw`\bclinically (proven|shown)\b`,
  String.raw`\bguarantee\w*`,
  String.raw`\byou (have|may have|probably have) (adhd|anxiety|depression|ptsd|ocd|bipolar)\b`,
];

// Effectiveness claims. Decision of 1 October 2026: never say how well an
// exercise works. Applied in full to wellbeing. In other genres words like
// "improve" and "effective" are normal business copy, so only the strong
// forms apply there.
const CLAIM_EFFECTIVENESS_FULL = [
  String.raw`\bproven\b`,
  String.raw`\bscientifically\b`,
  String.raw`\b(research|studies|a study|evidence|science) (shows?|suggests?|has shown|have shown|found|finds|says)\b`,
  String.raw`\b(most|more|very|highly) effective\b`,
  String.raw`\bworks? better\b`,
  String.raw`\bone of the (best|quickest|fastest|most)\b`,
  String.raw`\bmost people find\b`,
  String.raw`\b\d+ ?(percent|%)`,
  String.raw`\b(it|this|these|that|doing this) (can |will |may |should |often |usually )?(help|helps|calm|calms|ease|eases|reduce|reduces|improve|improves|lower|lowers|settle|settles|boost|boosts|fix|fixes)\b`,
  String.raw`\bcalm(s|ing)? your nervous system\b`,
  String.raw`\b(switch|switches|turn|turns) on (your|the) (body's )?calm`,
];

const CLAIM_EFFECTIVENESS_REDUCED = [
  String.raw`\bproven\b`,
  String.raw`\bscientifically\b`,
  String.raw`\bclinically\b`,
  String.raw`\b\d+ ?(percent|%) (more|better|faster|richer)\b`,
];

// Income and outcome promises for finance, business and career.
const CLAIM_MONEY = [
  String.raw`\b(double|triple|10x|ten times) your (income|money|savings|sales|revenue)\b`,
  String.raw`\bget rich\b`,
  String.raw`\bpassive income\b`,
  String.raw`\brisk[- ]free\b`,
  String.raw`\bguaranteed (return|income|profit|result)s?\b`,
  String.raw`\bbeat the market\b`,
  String.raw`\bfinancial(ly)? free(dom)?\b`,
];

export function claimPatterns(genre: Genre, tier: SafetyTier): RegExp {
  const parts = [...CLAIM_MEDICAL];
  if (tier !== "none" || genre === "wellbeing") parts.push(...CLAIM_EFFECTIVENESS_FULL);
  else parts.push(...CLAIM_EFFECTIVENESS_REDUCED);
  if (genre === "finance" || genre === "business" || genre === "career") parts.push(...CLAIM_MONEY);
  return new RegExp(parts.join("|"), "gi");
}

// Negated uses that are allowed, e.g. "This is a personal check, not a diagnosis."
export const CLAIM_ALLOW =
  /\bif (it|this|that) (helps|eases|calms)\b|\bnot (a |an )?(diagnos\w*|treatment|medical treatment|cure)\b|\b(does not|doesn't|never) (diagnose|treat)\b/gi;

// Spelling. The list is applied in the direction the workbook's `spelling`
// setting asks for. A British workbook is checked for American spellings and
// the other way round.
export const SPELLING_PAIRS: [us: string, gb: string][] = [
  ["color", "colour"],
  ["organize", "organise"],
  ["organized", "organised"],
  ["organizing", "organising"],
  ["behavior", "behaviour"],
  ["favorite", "favourite"],
  ["center", "centre"],
  ["mom", "mum"],
  ["realize", "realise"],
  ["realized", "realised"],
  ["program", "programme"],
  ["canceled", "cancelled"],
  ["labeled", "labelled"],
  ["right away", "straight away"],
  ["anymore", "any more"],
  ["practice", "practise"], // verb only in en-GB; flagged as a warning, not an error
];

export const BANNED_PHRASES: string[] = [
  // Old glossary names (one name per concept)
  String.raw`\baccountability partner`,
  String.raw`\bdaily operating system`,
  String.raw`\b2-minute version`,
  String.raw`\btwo-minute version`,
  String.raw`\bminimum morning`,
  String.raw`\btoolkit cards?\b`,
  String.raw`\blow days\b`,
  String.raw`\bdaily check-in\b`,
  String.raw`\bTillstep\b`,
  // Deficit wording
  String.raw`\bbad (day|days|patch|week)\b`,
  String.raw`\bfail(s|ed|ing|ure|ures)?\b`,
  // Stern or dismissive orders
  String.raw`\bskip the guilt\b`,
  String.raw`\bnothing else\.`,
  String.raw`\bjust that\.`,
  String.raw`\beverything\.\s+everything\b`,
  String.raw`\byou must\b`,
  String.raw`\byou should\b`,
  // Stock images, overpromises and generic praise
  String.raw`\bout of sight\b`,
  String.raw`\bautopilot\b`,
  String.raw`\bmarathon\b`,
  String.raw`\bembarrassingly\b`,
  String.raw`\blook forward to\b`,
  String.raw`\bjourney\b`,
  String.raw`\bgame[ -]?changer\b`,
  String.raw`\bunlock\b`,
  String.raw`\bsupercharge\w*`,
  String.raw`\bsimply\b`,
  String.raw`\byou did it\b`,
  String.raw`\bnice steady work\b`,
  // Comparison with other people
  String.raw`\bdoing better than\b`,
  String.raw`\bthan other people\b`,
  // Print verbs in a tap-based app
  String.raw`\bcircle\b`,
  String.raw`\btick\b`,
  // Old stage names in prose
  String.raw`\b(Map|Use) stage\b`,
  // Breathing: say inhale and exhale
  String.raw`\bbreathe (in|out)\b`,
];

// "X is not Y. It is Z." Allowed at most once per workbook.
export const NOT_IS_RE = /\b(is not|isn't|are not|aren't)\b[^.]{1,80}\.\s+(It is|It's|They are|They're)\b/i;
export const BREATH_RE = /\b(inhale|exhale|hold)\b[^.]*\b(two|three|four|five|six|seven|eight|\d+)\b/i;
export const HOLD_RE = /\bhold (for|your breath)\b/i;
export const HOLD_OPTOUT_RE = /\bskip\b|\bif it feels\b|\boptional\b/i;
export const CONTRACTION_RE = /\b\w+n't\b|\b\w+'(re|ve|ll|d|m)\b|\b(it|that|there|here|what|who|where|he|she|let)'s\b/gi;

export const SAFETY_KEYS = new Set(["extra_safety_note", "higher_tier_note", "safety_note", "consent", "legal", "crisis", "safety_hub", "advice_guardrail"]);
export const SAFETY_WORDS_RE =
  /\bhelp now\b|\bdanger\w*|\bcrisis\b|\bemergenc\w*|\bharm\w*|\bhurting yourself\b|\bnot wanting to be here\b|\bsafe(ty)?\b|\bdoctor\b|\bhealth professional\b|\bprescri\w*|\bmedication\b|\bsuicid\w*|\bconsent\b/i;

// Word limits by JSON path pattern. Paths use dotted keys with [] for list items.
export const LIMITS: Record<string, number> = {
  "exercises[].title": 6,
  "exercises[].purpose": 20,
  "exercises[].why": 60,
  "exercises[].steps[].text": 20,
  "exercises[].short_version.steps[].text": 20,
  "exercises[].example.text": 120,
  "exercises[].done_when": 20,
  "exercises[].reflect": 25,
  "toolkit[].title": 6,
  "toolkit[].steps[]": 15,
  "toolkit[].when_to_use": 20,
  "structure.stages[].primer.body": 120,
  "structure.stages[].outcome": 25,
  "milestones[].message": 25,
  "selfcheck.items[].text": 20,
  "checkin.fields[].label": 12,
  "start.welcome": 80,
  "tagline": 14,
  "card_line": 18,
};

// Keys that are notes for the house, not reader copy. Skipped by style checks.
export const NON_READER_KEYS = new Set([
  "internal", "cut_log", "source", "manuscript_file", "id", "trigger", "figure", "status", "set_id",
  "safety_tier", "schema_version", "area", "stage", "field_id", "plan_section", "toolkit_link",
  "stuck_alternative", "type", "character", "code", "slug", "theme_id", "genre", "language",
  "spelling", "badge", "licence_ref", "author_id", "publisher_id", "book_id", "store_links",
  "isbn", "asin", "depth", "unit", "prefill_from", "computed", "advice_guardrail", "v1_id",
]);

/**
 * Per-genre profile: counts the conference set for each shape. Wellbeing at
 * 12 weeks keeps the v1 numbers. Other genres scale with the unit count.
 */
export interface GenreProfile {
  exercisesPerUnit: [min: number, max: number];
  repeatableMin: number; // as a fraction of exercises, 0 to disable
  toolkit: [min: number, max: number];
  milestones: [min: number, max: number];
  communityMin: number;
  requiresSelfcheck: boolean;
  requiresDailyCheck: boolean;
  requiresSafetyHub: boolean;
  requiresCheckin: boolean;
  requiresAdviceGuardrail: boolean;
  readerWordsPerUnit: [min: number, max: number];
}

export function genreProfile(genre: Genre, tier: SafetyTier): GenreProfile {
  const wellbeing = tier !== "none" || genre === "wellbeing";
  if (wellbeing) {
    return {
      exercisesPerUnit: [1.8, 2.0],
      repeatableMin: 0.3,
      toolkit: [8, 10],
      milestones: [10, 12],
      communityMin: 2,
      requiresSelfcheck: true,
      requiresDailyCheck: true,
      requiresSafetyHub: true,
      requiresCheckin: true,
      requiresAdviceGuardrail: false,
      readerWordsPerUnit: [540, 800],
    };
  }
  const money = genre === "finance" || genre === "business";
  return {
    exercisesPerUnit: [1, 3],
    repeatableMin: 0,
    toolkit: [0, 20],
    milestones: [2, 12],
    communityMin: 0,
    requiresSelfcheck: false,
    requiresDailyCheck: false,
    requiresSafetyHub: false,
    requiresCheckin: false,
    requiresAdviceGuardrail: money,
    readerWordsPerUnit: [250, 1200],
  };
}
