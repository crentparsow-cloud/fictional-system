import type { WorkbookV3 as Workbook } from "@akana/schema";
import { NON_READER_KEYS } from "./rules";

/**
 * Plain English lint (build list 14.40). Optional. Nothing here runs unless
 * the caller asks for it, so the default `pnpm validate` is unchanged.
 *
 * The rules come from the GOV.UK style guide and docs/VOICE.md:
 *   - a sentence over 25 words is hard to follow on a phone
 *   - negative contractions (don't, can't, won't) are misread more often
 *     than the long form, so the long form is preferred everywhere
 *   - a short banned list: management words, and the words that mark
 *     machine-drafted prose
 *   - a unit title is a full sentence, so under five words is flagged
 *
 * Metaphor cannot be linted. docs/content/UNIT_SPEC.md leaves it to the
 * proofread. Every finding is a warning: this lint informs the copy pass,
 * it does not block a build.
 */

export interface PlainFinding {
  severity: "warning";
  category: "plain";
  rule: "long_sentence" | "negative_contraction" | "banned_word" | "short_unit_title";
  path: string;
  message: string;
  excerpt?: string;
}

export interface PlainOptions {
  /** Words a sentence may run to before it is flagged. Default 25. */
  maxSentenceWords?: number;
  /** A unit title with fewer words than this is flagged. Default 5. */
  unitTitleMinWords?: number;
}

export const PLAIN_MAX_SENTENCE_WORDS = 25;
export const PLAIN_UNIT_TITLE_MIN_WORDS = 5;

/** Words and phrases with a plainer form. Pattern, then what to write instead. */
export const PLAIN_BANNED: ReadonlyArray<readonly [pattern: string, instead: string]> = [
  // GOV.UK words to avoid
  [String.raw`\butili[sz](e|es|ed|ing|ation)\b`, "use"],
  [String.raw`\bleverag(e|es|ed|ing)\b`, "use"],
  [String.raw`\bin order to\b`, "to"],
  [String.raw`\bfacilitat(e|es|ed|ing)\b`, "help or run"],
  [String.raw`\bcommenc(e|es|ed|ing)\b`, "start"],
  [String.raw`\bprior to\b`, "before"],
  [String.raw`\bgoing forward\b`, "from now on"],
  [String.raw`\bin terms of\b`, "drop it"],
  [String.raw`\bat this (point in|moment in) time\b`, "now"],
  [String.raw`\bassist(s|ed|ing)?\b`, "help"],
  [String.raw`\bendeavou?r(s|ed|ing)?\b`, "try"],
  // Words that mark machine-drafted prose
  [String.raw`\bdelv(e|es|ed|ing)\b`, "look at"],
  [String.raw`\btapestry\b`, "say what it is"],
  [String.raw`\bembark(s|ed|ing)?\b`, "start"],
  [String.raw`\belevat(e|es|ed|ing)\b`, "raise or improve"],
  [String.raw`\bfoster(s|ed|ing)?\b`, "build or encourage"],
  [String.raw`\bharness(es|ed|ing)?\b`, "use"],
  [String.raw`\bseamless(ly)?\b`, "drop it"],
  [String.raw`\brobust\b`, "strong, or drop it"],
  [String.raw`\bholistic\b`, "whole"],
  [String.raw`\bcrucial\b`, "important, or drop it"],
  [String.raw`\btestament to\b`, "shows"],
  [String.raw`\bit('s| is) worth noting\b`, "drop it"],
  [String.raw`\bin today's\b`, "drop it"],
  [String.raw`\bnavigat(e|es|ed|ing) (the|your|this)\b`, "find your way, or say the action"],
  // docs/VOICE.md: "We're sorry", never a formal apology
  [String.raw`\bwe('d| would) like to apologi[sz]e\b`, "We're sorry"],
  [String.raw`\bapologies for\b`, "We're sorry"],
];

const PLAIN_BANNED_RE = PLAIN_BANNED.map(([p, instead]) => ({ re: new RegExp(p, "gi"), instead }));

// Negative contractions. "can't" and "won't" match through the n't ending.
export const NEGATIVE_CONTRACTION_RE = /\b[A-Za-z]+n't\b/g;

function words(s: string): number {
  return (s.match(/[A-Za-z0-9']+/g) ?? []).length;
}

function excerpt(s: string, n = 70): string {
  return s.length > n ? s.slice(0, n) + "..." : s;
}

function sentences(s: string): string[] {
  return s
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Run the plain English rules over one string. */
export function plainFindings(text: string, path: string, opts: PlainOptions = {}): PlainFinding[] {
  const max = opts.maxSentenceWords ?? PLAIN_MAX_SENTENCE_WORDS;
  const out: PlainFinding[] = [];
  for (const sentence of sentences(text)) {
    const n = words(sentence);
    if (n > max) {
      out.push({ severity: "warning", category: "plain", rule: "long_sentence", path, message: `${n} words in one sentence, aim for ${max} or fewer`, excerpt: excerpt(sentence) });
    }
  }
  for (const m of text.matchAll(NEGATIVE_CONTRACTION_RE)) {
    out.push({ severity: "warning", category: "plain", rule: "negative_contraction", path, message: `negative contraction '${m[0]}', write it out`, excerpt: excerpt(text, 50) });
  }
  for (const { re, instead } of PLAIN_BANNED_RE) {
    for (const m of text.matchAll(re)) {
      out.push({ severity: "warning", category: "plain", rule: "banned_word", path, message: `'${m[0]}': ${instead}`, excerpt: excerpt(text, 50) });
    }
  }
  return out;
}

/** A unit title must be a full sentence. Fewer than five words is a label, not a sentence. */
export function unitTitleFinding(title: string, path: string, opts: PlainOptions = {}): PlainFinding | undefined {
  const min = opts.unitTitleMinWords ?? PLAIN_UNIT_TITLE_MIN_WORDS;
  const n = words(title);
  if (n >= min) return undefined;
  return { severity: "warning", category: "plain", rule: "short_unit_title", path, message: `unit title has ${n} words, write a full sentence of ${min} or more`, excerpt: title };
}

/** Interface strings: a flat or nested record of key to text, as apps/web/messages holds them. */
export function checkPlainStrings(messages: Record<string, unknown>, prefix = "", opts: PlainOptions = {}): PlainFinding[] {
  const out: PlainFinding[] = [];
  const walk = (node: unknown, path: string) => {
    if (typeof node === "string") out.push(...plainFindings(node, path, opts));
    else if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${path}[${i}]`));
    else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
  };
  walk(messages, prefix);
  return out;
}

function isReaderCopy(path: string): boolean {
  return !path.split(/[.[\]]+/).filter(Boolean).some((p) => NON_READER_KEYS.has(p));
}

/** Workbook text: every reader-facing string, plus the unit title rule on units[].focus. */
export function checkPlainWorkbook(doc: Workbook, opts: PlainOptions = {}): PlainFinding[] {
  const out: PlainFinding[] = [];
  const walk = (node: unknown, path: string) => {
    if (typeof node === "string") {
      if (isReaderCopy(path)) out.push(...plainFindings(node, path, opts));
    } else if (Array.isArray(node)) {
      for (const v of node) walk(v, `${path}[]`);
    } else if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) walk(v, path ? `${path}.${k}` : k);
    }
  };
  walk(doc, "");
  for (const u of doc.units) {
    const f = unitTitleFinding(u.focus, `units[${u.number}].focus`, opts);
    if (f) out.push(f);
  }
  return out;
}

/** Counts by rule, for a one-line summary. */
export function summarisePlain(findings: PlainFinding[]): Record<PlainFinding["rule"], number> {
  const c: Record<PlainFinding["rule"], number> = { long_sentence: 0, negative_contraction: 0, banned_word: 0, short_unit_title: 0 };
  for (const f of findings) c[f.rule]++;
  return c;
}
