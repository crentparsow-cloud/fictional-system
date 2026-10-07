/**
 * Help now first (F-008). When a search looks like someone in distress or
 * danger, the Help now card goes above every workbook result.
 *
 * The term list is the interim list. It waits on clinician sign-off (gate C1,
 * question O15) and should be read as a floor, not a finished screen. It is
 * deliberately broad: showing the card to someone who did not need it costs
 * little, missing someone who did costs a great deal. It covers UK English
 * phrasing first, with common US and online variants.
 *
 * Everything here is pure and runs in the browser. Nothing in this module
 * logs, stores or sends the query, and nothing that calls it may either.
 */

/**
 * Lower case, accents stripped, apostrophes dropped (so "can't" reads as
 * "cant"), every other mark turned into a space, a few common contractions
 * and slang spellings folded, spaces collapsed.
 */
export function normaliseQuery(raw: string): string {
  const base = (raw ?? "")
    .slice(0, 200)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['‘’ʼ`´]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!base) return "";
  const words = base.split(" ").flatMap((w) => FOLD[w] ?? [w]);
  return ` ${words.join(" ")} `
    .replace(/ can not /g, " cant ")
    .replace(/ do not /g, " dont ")
    .replace(/ does not /g, " doesnt ")
    .replace(/ is not /g, " isnt ")
    .replace(/ my self /g, " myself ")
    .trim();
}

const FOLD: Record<string, string[]> = {
  cannot: ["cant"],
  wanna: ["want", "to"],
  gonna: ["going", "to"],
  wont: ["will", "not"],
  u: ["you"],
  ur: ["your"],
  pls: ["please"],
  plz: ["please"],
};

/**
 * Phrases matched as whole words in the normalised query. Write them already
 * normalised: lower case, no apostrophes ("cant", "dont", "im").
 */
export const CRISIS_PHRASES: readonly string[] = [
  // Ending life
  "suicide",
  "kill myself",
  "killing myself",
  "kms",
  "want to die",
  "want to be dead",
  "wish i was dead",
  "wish i were dead",
  "wish i wasnt here",
  "wish i wasnt alive",
  "ready to die",
  "going to die tonight",
  "better off dead",
  "better off without me",
  "end my life",
  "ending my life",
  "end it all",
  "ending it all",
  "take my life",
  "take my own life",
  "taking my own life",
  "no reason to live",
  "nothing to live for",
  "no point living",
  "no point in living",
  "not worth living",
  "life isnt worth living",
  "dont want to live",
  "dont want to be alive",
  "dont want to be here",
  "dont want to wake up",
  "cant go on",
  "cant carry on",
  "cant take it anymore",
  "cant take any more",
  "cant do this anymore",
  "cant cope",
  "hang myself",
  "jump off a bridge",
  "goodbye note",
  "suicide note",
  // Self harm
  "self harm",
  "self harming",
  "self injury",
  "hurt myself",
  "hurting myself",
  "harm myself",
  "harming myself",
  "cut myself",
  "cutting myself",
  "burn myself",
  "burning myself",
  "starve myself",
  "starving myself",
  // Overdose and poisoning
  "overdose",
  "overdosed",
  "overdosing",
  "too many pills",
  "took too many",
  "poison myself",
  // Abuse and danger
  "abuse",
  "abused",
  "abusive",
  "abuser",
  "domestic violence",
  "domestic abuse",
  "coercive control",
  "rape",
  "raped",
  "sexual assault",
  "sexually assaulted",
  "assaulted",
  "he hits me",
  "she hits me",
  "they hit me",
  "being hit",
  "in danger",
  "not safe at home",
  "unsafe at home",
  "afraid for my life",
  "scared for my life",
  "fear for my life",
  "going to hurt me",
  "threatening to kill",
  "being groomed",
  "was groomed",
];

/**
 * Word starts. A word in the query that begins with one of these counts, so
 * "suicidal", "unalive" and common misspellings are caught.
 */
export const CRISIS_STEMS: readonly string[] = ["suicid", "sucid", "suicd", "suisid", "sewerslid", "unaliv", "selfharm", "overdos", "kilmyself", "killmyself"];

/**
 * Phrases with spaces taken out, for words typed run together ("selfharm",
 * "cantgoon"). Compared word by word, never across the whole query, so
 * "find anger" does not read as "in danger".
 */
const COMPACT: readonly string[] = CRISIS_PHRASES.filter((p) => p.includes(" ")).map((p) => p.replace(/ /g, "")).filter((p) => p.length >= 7);
const COMPACT_SET: ReadonlySet<string> = new Set(COMPACT);

/**
 * True when the query matches any crisis term. Pure and cheap, so it runs on
 * every keystroke without a network request.
 */
export function isCrisisQuery(raw: string): boolean {
  const q = normaliseQuery(raw);
  if (!q) return false;
  const padded = ` ${q} `;
  for (const phrase of CRISIS_PHRASES) {
    if (padded.includes(` ${phrase} `)) return true;
  }
  const words = q.split(" ");
  for (const w of words) {
    for (const stem of CRISIS_STEMS) if (w.startsWith(stem)) return true;
  }
  for (const w of words) if (COMPACT_SET.has(w)) return true;
  return false;
}
