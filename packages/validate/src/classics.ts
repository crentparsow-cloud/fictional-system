/**
 * Classics source checks (build list 14.41). Pure functions; the CLI is
 * scripts/classics-source-check.ts. See docs/content/CLASSICS_PIPELINE.md.
 *
 * Four checks on a source text before any workbook work starts:
 *   1. the source edition is named
 *   2. the copyright term: published before 1931, or every contributor
 *      dead for more than 70 full calendar years (UK life plus 70)
 *   3. scan quality: the share of characters that a clean transcription
 *      would not contain
 *   4. a reversible modernisation: every change logged so it can be undone
 */

export interface Person {
  name: string;
  role: string;
  died?: number;
}

export interface CopyrightInput {
  /** Year of first publication, if known. */
  published?: number;
  people: Person[];
  /** The year to judge from. Defaults to the current year. */
  asOf?: number;
}

export interface CopyrightResult {
  /** Published before 1931 (the Tier A publication test). */
  publishedBefore1931: boolean | "unknown";
  /** Every contributor's term (death year plus 70, to the end of that year) has run out. */
  ukLifePlus70: boolean | "unknown";
  /** Names with no death year. The record cannot be signed until these are filled. */
  missingDeathYears: string[];
  /** The last year any contributor's UK term runs, when all death years are known. */
  ukTermEnds?: number;
  clear: boolean;
}

export const UK_TERM_YEARS = 70;
export const PUBLICATION_CUTOFF = 1931;

export function checkCopyright(input: CopyrightInput): CopyrightResult {
  const asOf = input.asOf ?? new Date().getFullYear();
  const publishedBefore1931 = input.published === undefined ? "unknown" : input.published < PUBLICATION_CUTOFF;
  const missing = input.people.filter((p) => p.died === undefined).map((p) => p.name);
  let ukLifePlus70: boolean | "unknown" = "unknown";
  let ukTermEnds: number | undefined;
  if (input.people.length > 0 && missing.length === 0) {
    ukTermEnds = Math.max(...input.people.map((p) => (p.died as number) + UK_TERM_YEARS));
    // The term runs to 31 December of the seventieth year, so the work is clear from the next year.
    ukLifePlus70 = asOf > ukTermEnds;
  }
  // Both tests must hold, with the publication test allowed to be unknown only
  // when the death years settle it. A record with unknown death years is never clear.
  const clear = ukLifePlus70 === true && publishedBefore1931 !== false;
  return { publishedBefore1931, ukLifePlus70, missingDeathYears: missing, ukTermEnds, clear };
}

export interface ScanQuality {
  chars: number;
  /** Characters outside printable ASCII, common Latin letters and ordinary whitespace. */
  unusual: number;
  ratio: number;
  /** U+FFFD, the sign of a broken encoding. */
  replacementChars: number;
  /** Digits inside a word, such as "wh0" or "s1x", a common OCR slip. */
  digitsInWords: number;
  /** Over the threshold: look at the file before any other step. */
  suspect: boolean;
}

export const SCAN_UNUSUAL_THRESHOLD = 0.005;

// Printable ASCII, tab, newline, carriage return, Latin-1 letters and the
// punctuation an old text legitimately carries (the pound sign, the section
// sign, accented letters). Everything else is counted as unusual.
const USUAL_RE = /[\x20-\x7E\t\n\r -ÿ‘’“”–—…]/u;

export function checkScanQuality(text: string): ScanQuality {
  let unusual = 0;
  let replacementChars = 0;
  for (const ch of text) {
    if (ch === "�") replacementChars++;
    if (!USUAL_RE.test(ch)) unusual++;
  }
  const digitsInWords = (text.match(/\b[A-Za-z]+\d+[A-Za-z]+\b|\b[A-Za-z]{2,}\d\b/g) ?? []).length;
  const chars = [...text].length;
  const ratio = chars === 0 ? 0 : unusual / chars;
  return { chars, unusual, ratio, replacementChars, digitsInWords, suspect: ratio > SCAN_UNUSUAL_THRESHOLD || replacementChars > 0 };
}

/**
 * Modernisation rules. Spelling and typography only. Nothing here changes a
 * word's meaning, and each rule is a plain replacement so the log can undo it.
 * Anything beyond this list is an editorial change and needs its own
 * [Editorial] commit with the reason in the message.
 */
export const MODERNISATION_RULES: ReadonlyArray<readonly [from: RegExp, to: string, note: string]> = [
  [/\bto-day\b/g, "today", "hyphenated to-day"],
  [/\bTo-day\b/g, "Today", "hyphenated To-day"],
  [/\bto-morrow\b/g, "tomorrow", "hyphenated to-morrow"],
  [/\bTo-morrow\b/g, "Tomorrow", "hyphenated To-morrow"],
  [/\bto-night\b/g, "tonight", "hyphenated to-night"],
  [/\bany one\b(?! of)/g, "anyone", "two-word any one (not before 'of')"],
  [/\bevery one\b(?! of)/g, "everyone", "two-word every one (not before 'of')"],
  [/\bconnexion(s?)\b/g, "connection$1", "connexion"],
  [/\bshew(n|s|ed|ing)?\b/g, "show$1", "shew"],
  [/&c\./g, "etc.", "ampersand c"],
  [/[“”]/g, '"', "curly double quote"],
  [/[‘’]/g, "'", "curly single quote"],
  [/ *— */g, ", ", "em dash to comma"],
  [/ *-- */g, ", ", "double hyphen to comma"],
];

export interface ModernisationEntry {
  /** 1-based line number. */
  line: number;
  /** 0-based column of the replacement in the modernised line, at the moment the rule ran. */
  col: number;
  from: string;
  to: string;
  note: string;
}

export interface ModernisationResult {
  text: string;
  log: ModernisationEntry[];
}

function applyRule(line: string, lineNo: number, from: RegExp, to: string, note: string, log: ModernisationEntry[]): string {
  const single = new RegExp(from.source, from.flags.replace("g", ""));
  const re = new RegExp(from.source, from.flags.includes("g") ? from.flags : from.flags + "g");
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m[0].length === 0) break;
    const replacement = m[0].replace(single, to);
    out += line.slice(last, m.index);
    log.push({ line: lineNo, col: out.length, from: m[0], to: replacement, note });
    out += replacement;
    last = m.index + m[0].length;
  }
  return out + line.slice(last);
}

/** Apply the rules line by line, one rule at a time, and record every change. */
export function modernise(text: string): ModernisationResult {
  const log: ModernisationEntry[] = [];
  const lines = text.split("\n").map((line, i) => {
    let current = line;
    for (const [from, to, note] of MODERNISATION_RULES) current = applyRule(current, i + 1, from, to, note, log);
    return current;
  });
  return { text: lines.join("\n"), log };
}

/**
 * Undo a modernisation using its log. Entries are undone last first, which
 * restores the text to the state each rule saw, so the recorded columns hold.
 * Throws if the text at a logged position is not what the log says: the file
 * has been edited since and the log no longer describes it.
 */
export function revert(text: string, log: ModernisationEntry[]): string {
  const lines = text.split("\n");
  for (const entry of [...log].reverse()) {
    const idx = entry.line - 1;
    const line = lines[idx];
    if (line === undefined) throw new Error(`log names line ${entry.line} but the text has ${lines.length} lines`);
    if (line.slice(entry.col, entry.col + entry.to.length) !== entry.to) {
      throw new Error(`line ${entry.line} col ${entry.col}: expected ${JSON.stringify(entry.to)}, the text has changed since the log was written`);
    }
    lines[idx] = line.slice(0, entry.col) + entry.from + line.slice(entry.col + entry.to.length);
  }
  return lines.join("\n");
}

/** Cut a Project Gutenberg header and licence when both markers are present. */
export function stripGutenbergBoilerplate(text: string): { text: string; stripped: boolean } {
  const start = text.search(/^\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG EBOOK.*$/mi);
  const end = text.search(/^\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG EBOOK.*$/mi);
  if (start === -1 || end === -1 || end <= start) return { text, stripped: false };
  const afterStart = text.indexOf("\n", start);
  return { text: text.slice(afterStart + 1, end).trim() + "\n", stripped: true };
}
