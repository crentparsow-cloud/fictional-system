import { TitleCopy as TitleCopySchema, type Genre, type SafetyTier } from "@akana/schema";
import { validateCopy, words, type Finding } from "./index";
import { plainFindings } from "./plain";

/**
 * Checks for the words on a title's page beyond the card: the outcome line,
 * "what you will have at the end", "who this is for" and the author letters
 * (build list 7.2, 7.3, 12.1). The claims and style rules are the workbook
 * rules, applied by shelf: a mental health title (tier standard or higher) gets
 * the full effectiveness list, a business or finance title gets the income
 * list. Length rules are the ones in docs/VOICE.md and the build list.
 */

export interface TitleCopyContext {
  genre: Genre;
  tier: SafetyTier;
  spelling: "en-GB" | "en-US";
  /** True for an invented demo author, false for a public domain classic. */
  isDemo: boolean;
  /** Units in the programme. Letters must sit inside it. */
  units: number;
  /** The author's name as the catalogue spells it, for the signature check. */
  author: string;
}

export const END_STATE_WORDS = { min: 60, max: 90 } as const;
export const CARD_LINE_WORDS = { min: 5, max: 18 } as const;
export const WHO_FOR_LINE_WORDS = 14;
export const LETTER_WORDS_MAX = 90;

/** Wording that promises a feeling or a result. Never allowed in a letter or a line. */
const OUTCOME_PROMISE_RE = /\b(you will (feel|be (happier|calmer|better|free|rich))|feel (better|calmer|lighter|happier)|get(ting)? better|life[- ]changing|transform\w*)\b/i;
const FIRST_PERSON_RE = /\b(I|my|me|mine|myself)\b/;

export function checkTitleCopy(entry: unknown, ctx: TitleCopyContext): Finding[] {
  const out: Finding[] = [];
  const err = (path: string, message: string, excerpt?: string) => out.push({ severity: "error", category: "style", path, message, excerpt });
  const parsed = TitleCopySchema.safeParse(entry);
  if (!parsed.success) {
    for (const i of parsed.error.issues) out.push({ severity: "error", category: "schema", path: i.path.join("."), message: i.message });
    return out;
  }
  const c = parsed.data;
  const code = c.code;

  const copy = (path: string, text: string) => {
    for (const f of validateCopy(text, ctx.genre, ctx.tier, ctx.spelling)) out.push({ ...f, path: `${code}.${path}`, excerpt: f.excerpt ?? text.slice(0, 60) });
    for (const p of plainFindings(text, `${code}.${path}`)) out.push({ severity: "warning", category: "style", path: p.path, message: `plain: ${p.message}`, excerpt: p.excerpt });
    if (OUTCOME_PROMISE_RE.test(text)) err(`${code}.${path}`, "promises a feeling or a result", text.slice(0, 60));
    if (/[{}]/.test(text.replace(/\{first_name\}/g, ""))) err(`${code}.${path}`, "stray brace", text.slice(0, 60));
  };

  const lw = words(c.card_line);
  if (lw < CARD_LINE_WORDS.min || lw > CARD_LINE_WORDS.max) err(`${code}.card_line`, `card line is ${lw} words, aim for ${CARD_LINE_WORDS.min} to ${CARD_LINE_WORDS.max}`, c.card_line);
  if (!c.card_line.endsWith(".") || /\.\s+\S/.test(c.card_line)) err(`${code}.card_line`, "card line is one sentence ending in a full stop", c.card_line);
  copy("card_line", c.card_line);

  const ew = words(c.end_state);
  if (ew < END_STATE_WORDS.min || ew > END_STATE_WORDS.max) err(`${code}.end_state`, `end state is ${ew} words, aim for ${END_STATE_WORDS.min} to ${END_STATE_WORDS.max}`);
  copy("end_state", c.end_state);

  c.who_for.forEach((line, i) => {
    if (words(line) > WHO_FOR_LINE_WORDS) err(`${code}.who_for[${i}]`, `more than ${WHO_FOR_LINE_WORDS} words`, line);
    copy(`who_for[${i}]`, line);
  });

  const ids = new Set<string>();
  const welcome = c.letters.filter((l) => l.kind === "welcome");
  const later = c.letters.filter((l) => l.kind === "unit");
  if (welcome.length !== 1 || c.letters[0]?.kind !== "welcome") err(`${code}.letters`, "exactly one welcome letter, and it comes first");
  if (later.length < 3 || later.length > 4) err(`${code}.letters`, `${later.length} later letters, expected three or four`);
  const positions = later.map((l) => l.at_unit ?? 0);
  if (positions.some((p, i) => i > 0 && p <= (positions[i - 1] ?? 0))) err(`${code}.letters`, "later letters are in week order, one per week");
  for (const l of c.letters) {
    const p = `letters.${l.id}`;
    if (ids.has(l.id)) err(`${code}.${p}`, "duplicate letter id");
    ids.add(l.id);
    if (l.at_unit !== undefined && l.at_unit > ctx.units) err(`${code}.${p}`, `at_unit ${l.at_unit} is past the last unit (${ctx.units})`);
    if (words(l.body) > LETTER_WORDS_MAX) err(`${code}.${p}`, `${words(l.body)} words, a letter is ${LETTER_WORDS_MAX} or fewer`);
    if (!l.body.startsWith("{first_name}")) err(`${code}.${p}`, "a letter opens with the reader's first name");
    if (ctx.isDemo) {
      if (l.from !== "author" || l.demo !== true) err(`${code}.${p}`, "a demo author's letter is from the author and marked demo");
      if (l.signed !== ctx.author) err(`${code}.${p}`, `signed ${JSON.stringify(l.signed)}, expected the author's name`);
    } else {
      if (l.from !== "akana" || l.demo) err(`${code}.${p}`, "a letter about a public domain author is from Akana and not marked demo");
      if (l.signed !== "Akana") err(`${code}.${p}`, "signed Akana");
      if (!l.title.includes(ctx.author) && !l.title.startsWith("A note from Akana")) err(`${code}.${p}.title`, "names Akana and the author");
      if (FIRST_PERSON_RE.test(l.body.replace(/"[^"]*"/g, ""))) err(`${code}.${p}`, "an Akana letter never speaks as the author or in the first person", l.body.slice(0, 60));
    }
    copy(`${p}.title`, l.title);
    copy(`${p}.body`, l.body.replace(/^\{first_name\}/, "Reader"));
  }
  return out;
}

/** The catalogue fields the title copy checks need. Field names are those of docs/planning/AK_Demo_Catalogue_v2.json. */
export interface CatalogueTitle {
  code: string;
  genre: string;
  safety_tier: string;
  spelling: string;
  is_demo: boolean;
  weeks?: number | null;
  author: string;
}

export function titleCopyContext(w: CatalogueTitle): TitleCopyContext {
  return {
    genre: w.genre.replace(/-/g, "_") as Genre,
    tier: w.safety_tier as SafetyTier,
    spelling: w.spelling === "en-US" ? "en-US" : "en-GB",
    isDemo: w.is_demo,
    units: w.weeks ?? 99,
    author: w.author,
  };
}
