/**
 * Word by word highlight during read-aloud (3.5 extension). The browser's
 * voice reports where it is in the sentence through "boundary" events. Some
 * voices send none (many network voices, some Android engines), and then the
 * sentence highlight carries on alone.
 */

/**
 * The word at a character position in a sentence, as a start and an end (end
 * exclusive). A position inside a word gives the whole word; one in a gap
 * gives the next word. The length some browsers send is not used, because it
 * is not the same everywhere.
 */
export function wordRangeAt(text: string, charIndex: number): { start: number; end: number } | null {
  if (!Number.isInteger(charIndex) || charIndex < 0 || charIndex >= text.length) return null;
  const isWord = (c: string) => /[\p{L}\p{N}'’-]/u.test(c);
  let start = charIndex;
  if (isWord(text[start]!)) {
    while (start > 0 && isWord(text[start - 1]!)) start--;
  } else {
    while (start < text.length && !isWord(text[start]!)) start++;
  }
  if (start >= text.length) return null;
  let end = start;
  while (end < text.length && isWord(text[end]!)) end++;
  return end > start ? { start, end } : null;
}

/**
 * Where a position in the spoken sentence falls in the page's own text. The
 * spoken sentence has its runs of whitespace folded to one space and its ends
 * trimmed; the page text does not.
 */
export function toSourceOffset(source: string, sentenceStart: number, spokenIndex: number): number {
  let i = sentenceStart;
  let k = 0;
  while (k < spokenIndex && i < source.length) {
    if (/\s/.test(source[i]!)) {
      while (i < source.length && /\s/.test(source[i]!)) i++;
    } else {
      i++;
    }
    k++;
  }
  return i;
}

/** A word in the page's own text, from a boundary position in the spoken sentence. */
export function sourceWordRange(source: string, sentenceStart: number, spoken: string, charIndex: number): { start: number; end: number } | null {
  const w = wordRangeAt(spoken, charIndex);
  if (!w) return null;
  const start = toSourceOffset(source, sentenceStart, w.start);
  const end = toSourceOffset(source, sentenceStart, w.end);
  return end > start ? { start, end } : null;
}

/** Reads the fields of a boundary event, or null when it is not a word boundary. */
export function readBoundary(ev: unknown): { charIndex: number } | null {
  if (typeof ev !== "object" || ev === null) return null;
  const e = ev as { name?: unknown; charIndex?: unknown };
  if (e.name !== undefined && e.name !== "word") return null;
  if (typeof e.charIndex !== "number" || !Number.isFinite(e.charIndex) || e.charIndex < 0) return null;
  return { charIndex: e.charIndex };
}
