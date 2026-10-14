/**
 * Splits text into sentence-sized chunks for the browser's voice (3.5).
 *
 * Chrome on desktop cuts an utterance off after about 15 seconds, so one
 * long paragraph handed over whole goes silent part way. Each chunk is a
 * sentence, and a sentence that is still long is cut at a clause break, then
 * at a space, so no chunk runs past MAX_CHUNK characters (about 12 seconds at
 * a normal rate). Every chunk keeps its offsets in the original string, so
 * the page can highlight the sentence being spoken.
 */

export interface Chunk {
  /** What is spoken: the sentence with its whitespace tidied. */
  text: string;
  /** Offsets of the sentence in the original string, end exclusive. */
  start: number;
  end: number;
}

/** About 12 seconds of speech at a normal rate. */
export const MAX_CHUNK = 180;

/** Words that end in a full stop without ending the sentence. */
const ABBREVIATIONS = new Set(["mr", "mrs", "ms", "dr", "prof", "st", "vs", "etc", "eg", "ie", "no", "approx", "fig", "cf", "mt", "jr", "sr"]);

function endsSentence(text: string, at: number): boolean {
  // `at` is the index of a ., ! or ? character.
  const ch = text[at]!;
  let end = at;
  while (end + 1 < text.length && /[.!?]/.test(text[end + 1]!)) end++;
  // Closing quotes and brackets belong to the sentence they close.
  while (end + 1 < text.length && /["')\]’”]/.test(text[end + 1]!)) end++;
  const next = text[end + 1];
  if (next !== undefined && !/\s/.test(next)) return false;
  if (ch === ".") {
    const before = /([A-Za-z]+)$/.exec(text.slice(Math.max(0, at - 12), at));
    if (before && ABBREVIATIONS.has(before[1]!.toLowerCase())) return false;
    // A single capital letter before the stop is an initial: "J. Smith".
    if (before && before[1]!.length === 1 && /[A-Z]/.test(before[1]!)) return false;
    // A number followed by a stop and a digit is a decimal, handled by the next check.
  }
  return true;
}

/** Cut an over-long span at the last clause break, else the last space, before `max`. */
function splitLong(text: string, from: number, to: number, max: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = from;
  while (to - start > max) {
    const window = text.slice(start, start + max);
    let cut = -1;
    for (const re of [/[;:—–]\s/g, /,\s/g, /\s/g]) {
      let m: RegExpExecArray | null;
      let last = -1;
      while ((m = re.exec(window))) last = m.index + m[0].length;
      // Do not cut so early that the next chunk is left over-long for no reason.
      if (last > max * 0.4) {
        cut = last;
        break;
      }
    }
    if (cut < 0) cut = max;
    out.push([start, start + cut]);
    start += cut;
  }
  out.push([start, to]);
  return out;
}

export function chunkSentences(text: string, max = MAX_CHUNK): Chunk[] {
  const spans: Array<[number, number]> = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if ((c === "." || c === "!" || c === "?") && endsSentence(text, i)) {
      let end = i + 1;
      while (end < text.length && /[.!?"')\]’”]/.test(text[end]!)) end++;
      spans.push([start, end]);
      start = end;
      i = end - 1;
    } else if (c === "\n" && text[i + 1] === "\n") {
      spans.push([start, i]);
      start = i + 1;
    }
  }
  if (start < text.length) spans.push([start, text.length]);

  const out: Chunk[] = [];
  for (const [s, e] of spans) {
    for (const [a, b] of e - s > max ? splitLong(text, s, e, max) : [[s, e] as [number, number]]) {
      const raw = text.slice(a, b);
      const lead = raw.length - raw.trimStart().length;
      const spoken = raw.replace(/\s+/g, " ").trim();
      // Nothing to say: whitespace, or punctuation and digits-free marks only.
      if (!spoken || !/[\p{L}\p{N}]/u.test(spoken)) continue;
      out.push({ text: spoken, start: a + lead, end: a + lead + raw.trim().length });
    }
  }
  return out;
}
