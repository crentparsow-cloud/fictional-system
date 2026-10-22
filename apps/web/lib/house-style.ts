import { BANNED_CHARS, CLAIM_ALLOW, EMOJI, SPELLING_PAIRS, claimPatterns, plainFindings } from "@akana/validate";

/**
 * House style lint for short staff-written copy: author bios (7.6), Theme
 * intros (7.7), editorial slot lines (7.10) and newsletter issues (6.11).
 * Pure, so the console, the Studio and the tests share one answer.
 *
 * Errors block a save: dashes and curly quotes, emoji, copy over the length
 * limit, claim words (cure, proven, guaranteed and the like) and American
 * spellings. Warnings inform: long sentences, negative contractions and the
 * words that mark machine-written prose. Bios must also be in the third
 * person, because a bio sits under the author's name on a page.
 *
 * The database repeats the dash, quote and length rules (migration 0062,
 * 0063) so the console is not the only gate.
 */

export type StyleSeverity = "error" | "warning";
export interface StyleIssue {
  severity: StyleSeverity;
  rule: string;
  message: string;
}

export interface StyleOptions {
  /** Longest allowed copy in characters. */
  maxLength?: number;
  /** Shortest allowed copy in characters. Blank copy is never an issue: the field is optional. */
  minLength?: number;
  /** Refuse "I", "my" and "me": the copy is written about someone else. */
  thirdPerson?: boolean;
  /** Skip the plain English warnings. */
  skipPlain?: boolean;
}

export const BIO_MAX = 700;
export const BIO_MIN = 40;
export const INTRO_MAX = 700;
export const SLOT_LINE_MAX = 240;

const FIRST_PERSON = /\b(I|me|my|mine|myself|I'm|I've|I'll|I'd)\b/;
// "practice" is only wrong as a verb in British English, so it is left to the proofread.
const US_ONLY = SPELLING_PAIRS.filter(([us]) => us !== "practice");

/** Every issue in the copy, errors first. */
export function houseStyleIssues(text: string, opts: StyleOptions = {}): StyleIssue[] {
  const value = text.trim();
  if (!value) return [];
  const out: StyleIssue[] = [];

  const chars = new Set<string>();
  for (const ch of value) if (BANNED_CHARS[ch]) chars.add(BANNED_CHARS[ch]);
  for (const name of chars) {
    out.push({ severity: "error", rule: "punctuation", message: `Replace the ${name} with plain punctuation. Use a full stop, a comma or straight quotes.` });
  }
  if (EMOJI.test(value)) out.push({ severity: "error", rule: "emoji", message: "Take out the emoji." });

  if (opts.maxLength !== undefined && value.length > opts.maxLength) {
    out.push({ severity: "error", rule: "too_long", message: `${value.length} characters. The limit is ${opts.maxLength}.` });
  }
  if (opts.minLength !== undefined && value.length < opts.minLength) {
    out.push({ severity: "error", rule: "too_short", message: `${value.length} characters. Write at least ${opts.minLength}.` });
  }
  if (opts.thirdPerson && FIRST_PERSON.test(value)) {
    out.push({ severity: "error", rule: "third_person", message: "Write about the author in the third person: \"Sam writes\", not \"I write\"." });
  }

  const allowed = value.replace(CLAIM_ALLOW, " ");
  const claims = new Set<string>();
  for (const m of allowed.matchAll(claimPatterns("wellbeing", "standard"))) claims.add(m[0].toLowerCase());
  for (const c of [...claims].slice(0, 5)) {
    out.push({ severity: "error", rule: "claim", message: `"${c}" makes a claim. Say what the person does, not what it will do for you.` });
  }

  const lower = value.toLowerCase();
  for (const [us, gb] of US_ONLY) {
    if (new RegExp(`\\b${us}\\b`).test(lower)) out.push({ severity: "error", rule: "spelling", message: `Use UK spelling: "${gb}", not "${us}".` });
  }

  if (!opts.skipPlain) {
    const seen = new Set<string>();
    for (const f of plainFindings(value, "copy")) {
      if (seen.has(f.message)) continue;
      seen.add(f.message);
      out.push({ severity: "warning", rule: f.rule, message: f.message });
    }
  }
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
}

export function hasStyleErrors(issues: readonly StyleIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

/** An author bio: third person, 40 to 700 characters, plain punctuation, no claims. */
export function bioIssues(bio: string): StyleIssue[] {
  return houseStyleIssues(bio, { maxLength: BIO_MAX, minLength: BIO_MIN, thirdPerson: true });
}

/** A Theme intro: up to 700 characters. */
export function introIssues(intro: string): StyleIssue[] {
  return houseStyleIssues(intro, { maxLength: INTRO_MAX });
}

/** A short line (editorial slot): up to 240 characters. */
export function lineIssues(line: string, max = SLOT_LINE_MAX): StyleIssue[] {
  return houseStyleIssues(line, { maxLength: max });
}

const FLAG_LABELS: Record<string, string> = {
  punctuation: "Style: dash or curly quote",
  emoji: "Style: emoji",
  too_long: `Style: over ${BIO_MAX} characters`,
  too_short: `Style: under ${BIO_MIN} characters`,
  third_person: "Style: first person",
  spelling: "Style: US spelling",
};

/**
 * Everything staff should look at before a bio goes public (7.6): the claim
 * phrases the Studio already flags, plus one short "Style: ..." line for each
 * house style error. A flag does not stop an author sending the bio, because
 * their text must not be lost; it makes staff approve with a logged reason, or
 * ask for changes.
 */
export function bioReviewFlags(bio: string, claimFlags: readonly string[]): string[] {
  const style = bioIssues(bio)
    .filter((i) => i.severity === "error" && i.rule !== "claim")
    .map((i) => FLAG_LABELS[i.rule])
    .filter((l): l is string => Boolean(l));
  return [...new Set([...claimFlags, ...style])];
}
