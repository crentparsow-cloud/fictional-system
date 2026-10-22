/**
 * "You wrote 1,200 words this month" (build list 12.6).
 *
 * Answers are sealed. The server opens an answer for its owner, counts the
 * words, stores only the number (answer_word_counts, migration 0050) and
 * drops the text. Nothing here returns, logs or stores any answer text.
 */

/** Words in an answer value. Text counts; numbers, booleans and keys do not. */
export function wordsIn(value: unknown): number {
  if (typeof value === "string") return (value.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
  if (Array.isArray(value)) return value.reduce<number>((n, v) => n + wordsIn(v), 0);
  if (value && typeof value === "object") return Object.values(value).reduce<number>((n, v) => n + wordsIn(v), 0);
  return 0;
}

/** True when the stored count was made for the answer as it now stands. */
export function countIsCurrent(countedFor: string | null | undefined, answerUpdatedAt: string): boolean {
  if (!countedFor) return false;
  return Date.parse(countedFor) >= Date.parse(answerUpdatedAt);
}

/** The line on the You page. Nothing is shown for none, so a quiet month stays quiet. */
export function wordsLine(words: number): string | null {
  const n = Math.max(0, Math.floor(words));
  if (n === 0) return null;
  return `You wrote ${n.toLocaleString("en-GB")} ${n === 1 ? "word" : "words"} this month.`;
}
