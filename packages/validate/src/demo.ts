import type { WorkbookV3 as Workbook } from "@akana/schema";
import { NON_READER_KEYS } from "./rules";
import { habitLanguageHits } from "./habit-lint";

/**
 * The demo profile of schema 3.1 (30 October 2026). A demo workbook is a short
 * four-part workbook for an invented book by an invented author. It has no
 * source text, no manuscript and no licence, so it carries no quotations, no
 * `internal` block and `licence_ref: null`. See the writer brief and
 * content/workbooks/demo.
 *
 * validateWorkbook runs these checks instead of the unit spec and the genre
 * counts whenever `is_demo` is true. The style, claims, limits and reference
 * checks still run as for every workbook.
 */

export const DEMO_PROFILE = {
  unit: "part",
  count: 4,
  freeUnits: 1,
  ideasPerUnit: 3,
  introWords: [40, 80] as [number, number],
  ideaBodyWords: [40, 70] as [number, number],
  headingMinWords: 5,
  takeawayMaxWords: 40,
  exercisesPerUnit: 1,
  fieldsPerExercise: [1, 2] as [number, number],
  exerciseMinutes: [4, 6] as [number, number],
  milestones: [2, 5] as [number, number],
  /** Reader pages: every reader-facing word divided by this, a printed paperback page. */
  wordsPerPage: 300,
  pages: [4, 6] as [number, number],
  /** A quoted line longer than this reads as a passage from a book, not words a reader might say. */
  quoteMaxWords: 15,
  /** A quoted span this long next to an attribution ("as she wrote") reads as a quotation. */
  attributedQuoteMinWords: 4,
} as const;

/**
 * The title, book title and subtitle are catalogue identity, copied from the
 * catalogue row and checked there. The style, claims and marketing word rules
 * skip them on a demo; the em dash and the quotation bans still apply.
 */
export const DEMO_IDENTITY_PATHS: ReadonlySet<string> = new Set(["title", "book.title", "book.subtitle"]);

/** The shelf whose titles get the strictest wording rules. */
export const MIND_AND_MOOD_SHELF = "mind-and-mood";

export interface DemoOptions {
  /** The title's shelf id from the registry (content/registry/themes.json). When unknown, a wellbeing genre title is treated as Mind and Mood. */
  shelf?: string;
}

type Severity = "error" | "warning";
interface DemoFinding {
  severity: Severity;
  category: "schema" | "style" | "claims" | "limit" | "refs" | "count" | "safety" | "depth";
  path: string;
  message: string;
  excerpt?: string;
}

function count(s: string | undefined): number {
  return ((s ?? "").match(/[A-Za-z0-9']+/g) ?? []).length;
}

function cut(s: string, n = 60): string {
  return s.length > n ? s.slice(0, n) + "..." : s;
}

function* readerStrings(node: unknown, path = ""): Generator<[string, string]> {
  if (typeof node === "string") {
    yield [path, node];
  } else if (Array.isArray(node)) {
    for (const v of node) yield* readerStrings(v, `${path}[]`);
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (NON_READER_KEYS.has(k)) continue;
      yield* readerStrings(v, path ? `${path}.${k}` : k);
    }
  }
}

/** Every reader-facing word in a demo file, and the reader pages that makes. */
export function demoReaderWords(doc: Workbook): number {
  let n = 0;
  for (const [, s] of readerStrings(doc)) n += count(s);
  return n;
}

export function demoReaderPages(doc: Workbook): number {
  return Math.round((demoReaderWords(doc) / DEMO_PROFILE.wordsPerPage) * 10) / 10;
}

// A spaced hyphen or a double hyphen used as a dash. The em dash itself is a banned character for every workbook.
const DASH_RE = /\s-{1,2}\s|--/;
// "free" is true only of Part 1. Anything wider says a paid title costs nothing.
// A hyphenated "-free" compound (screen-free, phone-free, sugar-free) is not a price.
const FREE_RE = /(?<!-)\bfree\b/i;
const PART_ONE_RE = /\b(part 1|part one|the first part)\b/i;
const WIDER_RE = /\b(parts? [2-4]|parts two|all (four )?parts|whole (workbook|thing)|every part|the rest|everything|always|no cost|of charge|for free)\b/i;
// Habit and goal words a Mind and Mood title never uses, beyond the 11.3 lint.
const MOOD_WORDS: ReadonlyArray<[RegExp, string]> = [
  [/\bgoals?\b/i, "goal language"],
  [/\btargets?\b/i, "target language"],
  [/\b(every|each) (single )?(day|morning|evening|night)\b/i, "every day language"],
  // "each day" is fine on every other shelf (a card line, a body); only here is it banned.
  [/\bdaily\b/i, "daily language"],
  [/\bstreaks?\b/i, "streak language"],
  [/\bin a row\b/i, "in a row language"],
  [/\bhabits?\b/i, "habit language"],
];
// Clinical words and claims. A demo makes no clinical claim on any shelf; Mind and Mood titles avoid the vocabulary altogether.
const CLINICAL_RE =
  /\b(anxiety|depress\w*|disorders?|therap(y|ies|ist|ists|eutic)|clinical\w*|symptoms?|diagnos\w*|trauma\w*|ptsd|adhd|ocd|bipolar|mental illness|patients?|recovery|relapse|panic attacks?|medicat\w*|counsell(ing|or|ors))\b/i;
// Links and numbers: no demo points anywhere outside the app.
const LINK_RE = /https?:\/\/|www\.|\b\d{3,}[ -]?\d{3,}\b|\b(111|999|112|911|116 ?123|85258)\b/i;
// Services: a Mind and Mood or wellbeing-tier demo signposts nothing. Help now in the app does that job.
const SERVICE_RE = /\b(samaritans|nhs|shout|helplines?|hotlines?|crisis lines?|gp|counsell?ors?|therapists?|psychologists?|doctors?|support lines?)\b/i;
// Pressure wording. Titles on the standard or higher tier are gentle.
const PRESSURE_RE =
  /\b(you need to|you have to|have to|make sure|don'?t forget|do not forget|commit(ment)? to|challenge yourself|push yourself|no excuses|stick (to|with) it|keep going no matter|without fail|every time)\b/i;
// Citation of a book or a page.
const CITE_RE = /\b(p\.|pp\.|page \d+|chapter \d+)(?=\s|$|[,.;:])/i;
// Attribution of quoted words to a writer or a book.
const ATTRIBUTION_RE = /\b(wrote|writes|written|once said|famously|put it|puts it|in (his|her|their|the) (book|novel|essay|poem|memoir)|the book says|the author says)\b/i;
const QUOTED_RE = /"([^"]+)"/g;

/** The checks a demo workbook must pass on top of the shared style, claims and limit checks. */
export function checkDemo(doc: Workbook, raw: unknown, out: DemoFinding[], opts: DemoOptions = {}): void {
  const err = (category: DemoFinding["category"], path: string, message: string, excerpt?: string) => out.push({ severity: "error", category, path, message, excerpt });
  const warn = (category: DemoFinding["category"], path: string, message: string) => out.push({ severity: "warning", category, path, message });
  const P = DEMO_PROFILE;
  const rawObj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  // Identity and shape.
  if (doc.badge !== "demo") err("schema", "badge", `a demo workbook is badged demo, not ${doc.badge}`);
  if (!("licence_ref" in rawObj) || rawObj.licence_ref !== null) err("schema", "licence_ref", "a demo workbook carries licence_ref: null");
  if ("internal" in rawObj) err("schema", "internal", "a demo workbook has no internal block: there is no source text or manuscript");
  if ("status" in rawObj) err("schema", "status", "a demo file carries no status; the catalogue row keeps its own");
  if (doc.spelling !== "en-GB") err("style", "spelling", "demo workbooks are written in UK English (en-GB)");
  if (doc.depth !== "full") err("depth", "depth", "a demo workbook file is written in full (depth full)");
  if (doc.structure.unit !== P.unit) err("schema", "structure.unit", `a demo workbook is in parts (unit "${P.unit}")`);
  if (doc.structure.count !== P.count) err("schema", "structure.count", `a demo workbook has ${P.count} parts, not ${doc.structure.count}`);
  if (doc.structure.free_units !== P.freeUnits) err("schema", "structure.free_units", `free_units is ${P.freeUnits} on a demo workbook`);
  if (doc.structure.stages?.length) err("schema", "structure.stages", "a demo workbook has no stages");
  if (doc.safety_hub) err("safety", "safety_hub", "a demo workbook carries no safety hub; Help now in the app does that job");
  if (doc.selfcheck || doc.checkin || doc.daily_check) err("schema", "", "a demo workbook has no self-check, check-in or daily check");
  if (doc.toolkit.length) err("schema", "toolkit", "a demo workbook has no toolkit");
  if (!doc.keep_going) err("schema", "keep_going", "a demo workbook needs keep_going");
  if (!doc.plan_sections.length) err("schema", "plan_sections", "a demo workbook needs at least one plan section");
  const [mLo, mHi] = P.milestones;
  if (doc.milestones.length < mLo || doc.milestones.length > mHi) err("count", "milestones", `${doc.milestones.length} milestones, a demo has ${mLo} to ${mHi}`);
  for (const m of doc.milestones) {
    if (!/^(first_exercise|unit_complete:\d+|program_complete|finished|exercises_done:\d+|plan_lines:\d+)$/.test(m.trigger)) {
      err("safety", `milestones.${m.id}`, `trigger ${m.trigger} is not used in a demo (first_exercise, unit_complete, exercises_done, plan_lines, program_complete, finished)`);
    }
  }

  // Units.
  const exById = new Map(doc.exercises.map((e) => [e.id, e]));
  if (doc.exercises.length !== P.count * P.exercisesPerUnit) err("count", "exercises", `${doc.exercises.length} exercises, a demo has exactly ${P.count * P.exercisesPerUnit}`);
  for (const u of doc.units) {
    const at = `units[${u.number}]`;
    const iw = count(u.intro);
    if (u.intro === undefined) err("limit", `${at}.intro`, "every part needs an intro");
    else if (iw < P.introWords[0] || iw > P.introWords[1]) err("limit", `${at}.intro`, `${iw} words, a demo intro is ${P.introWords[0]} to ${P.introWords[1]}`);
    const ideas = u.ideas ?? [];
    if (ideas.length !== P.ideasPerUnit) err("count", `${at}.ideas`, `${ideas.length} key ideas, a demo part has exactly ${P.ideasPerUnit}`);
    ideas.forEach((idea, i) => {
      const p = `${at}.ideas[${i}]`;
      const hw = count(idea.heading);
      if (hw < P.headingMinWords) err("limit", `${p}.heading`, `${hw} words, a heading is a full sentence of ${P.headingMinWords} or more`, idea.heading);
      const bw = count(idea.body);
      if (bw < P.ideaBodyWords[0] || bw > P.ideaBodyWords[1]) err("limit", `${p}.body`, `${bw} words, a demo idea body is ${P.ideaBodyWords[0]} to ${P.ideaBodyWords[1]}`, cut(idea.heading));
    });
    if (u.takeaway === undefined || !u.takeaway.trim()) err("limit", `${at}.takeaway`, "every part needs a takeaway");
    else if (count(u.takeaway) > P.takeawayMaxWords) err("limit", `${at}.takeaway`, `${count(u.takeaway)} words, limit ${P.takeawayMaxWords}`);
    if (u.exercise_ids.length !== P.exercisesPerUnit) err("count", `${at}.exercise_ids`, `${u.exercise_ids.length} exercises, a demo part has exactly ${P.exercisesPerUnit}`);
    for (const id of u.exercise_ids) {
      const e = exById.get(id);
      if (!e) continue;
      const ep = `exercises.${e.id}`;
      const [fLo, fHi] = P.fieldsPerExercise;
      if (e.fields.length < fLo || e.fields.length > fHi) err("count", `${ep}.fields`, `${e.fields.length} fields, a demo exercise has ${fLo} or ${fHi}`);
      const [tLo, tHi] = P.exerciseMinutes;
      if (e.minutes < tLo || e.minutes > tHi) err("limit", `${ep}.minutes`, `${e.minutes} minutes, a demo exercise takes ${tLo} to ${tHi}`);
      const q = e.fields[0]?.label ?? "";
      if (!q.trim().endsWith("?")) err("style", `${ep}.fields.${e.fields[0]?.id ?? "0"}.label`, "the first field is the direct question and ends with a question mark", q);
      if (e.source) warn("refs", `${ep}.source`, "a demo exercise has no source book to cite; leave source out");
    }
  }

  const pages = demoReaderPages(doc);
  if (pages < P.pages[0] || pages > P.pages[1]) warn("count", "", `about ${pages} reader pages (${demoReaderWords(doc)} words at ${P.wordsPerPage} a page), a demo is ${P.pages[0]} to ${P.pages[1]}`);

  // Wording.
  const mood = opts.shelf ? opts.shelf === MIND_AND_MOOD_SHELF : doc.genre === "wellbeing";
  const gentle = doc.safety_tier !== "none";
  for (const [path, s] of readerStrings(doc)) {
    // Quotations. A demo book is invented, so there is nothing to quote. Short
    // lines a reader might say ("Not this time, thank you.") are fine; a long
    // quoted passage, or quoted words put down to a writer or a book, are not.
    for (const sentence of s.split(/(?<=[.!?"])\s+/)) {
      for (const m of sentence.matchAll(QUOTED_RE)) {
        const n = count(m[1]);
        if (n > P.quoteMaxWords) err("style", path, `a quoted passage of ${n} words; a demo quotes no book, real or invented`, cut(m[1] ?? ""));
        else if (n >= P.attributedQuoteMinWords && ATTRIBUTION_RE.test(sentence.replace(QUOTED_RE, ""))) {
          err("style", path, "quoted words put down to a writer or a book; a demo quotes no book, real or invented", cut(sentence));
        }
      }
    }
    if (CITE_RE.test(s)) err("style", path, "a page or chapter citation; a demo quotes no book", cut(s));
    if (DASH_RE.test(s)) err("style", path, "a hyphen used as a dash; use a comma, a full stop or 'and'", cut(s));
    // Catalogue identity: only the dash and quotation bans above apply.
    if (DEMO_IDENTITY_PATHS.has(path)) continue;
    // "free" in a line the reader might say ("I'm free on Monday") is not a price.
    for (const sentence of s.replace(QUOTED_RE, '"q"').split(/(?<=[.!?])\s+/)) {
      if (FREE_RE.test(sentence) && !(PART_ONE_RE.test(sentence) && !WIDER_RE.test(sentence))) {
        err("claims", path, "'free' on a paid title; only Part 1 is free, and the app says so", cut(sentence));
      }
    }
    if (CLINICAL_RE.test(s) && mood) err("claims", path, `clinical word '${CLINICAL_RE.exec(s)?.[0]}' on a Mind and Mood title`, cut(s));
    if (LINK_RE.test(s)) err("safety", path, `link or number '${LINK_RE.exec(s)?.[0]}'; a demo points nowhere outside the app`, cut(s));
    if ((mood || gentle) && SERVICE_RE.test(s)) err("safety", path, `signpost '${SERVICE_RE.exec(s)?.[0]}'; this demo signposts nothing, Help now in the app does that`, cut(s));
    if (gentle && PRESSURE_RE.test(s)) err("safety", path, `pressure wording '${PRESSURE_RE.exec(s)?.[0]}' on a ${doc.safety_tier} tier title`, cut(s));
    if (mood) {
      for (const [re, name] of MOOD_WORDS) {
        const m = re.exec(s);
        if (m) err("safety", path, `${name} '${m[0]}' on a Mind and Mood title`, cut(s));
      }
      // The 11.3 lint at full strength: its missed-day and countdown warnings are errors here.
      for (const h of habitLanguageHits(s)) if (h.severity === "warning") err("safety", path, `${h.message} '${h.match}' on a Mind and Mood title`, cut(s));
    }
  }
}
