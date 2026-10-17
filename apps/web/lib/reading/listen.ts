/**
 * Where the reader stopped listening (3.5). Kept on the device only, as a
 * screen name, a sentence number and the first words of that sentence, so it
 * can tell whether the page is still the one it was saved from. No answer is
 * ever stored here: only text the workbook itself contains.
 */

export const LISTEN_MODE_KEY = "ak:listen-mode";
export const LISTEN_RATE_KEY = "ak:listen-rate";
export const listenPositionKey = (enrolmentId: string) => `ak:listen:${enrolmentId}`;

export type ListenMode = "read" | "listen";

export interface ListenPosition {
  screen: string;
  index: number;
  /** The first 40 characters of the sentence. */
  lead: string;
}

const lead = (text: string) => text.slice(0, 40);

export function makePosition(screen: string, index: number, sentence: string): ListenPosition {
  return { screen, index, lead: lead(sentence) };
}

export function parsePosition(raw: string | null | undefined): ListenPosition | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<ListenPosition>;
    if (typeof v.screen === "string" && typeof v.lead === "string" && Number.isInteger(v.index) && (v.index as number) >= 0) {
      return { screen: v.screen, index: v.index as number, lead: v.lead };
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * The sentence to start from: the stored one when this is still the same
 * screen and that sentence still starts with the same words, otherwise the
 * top. If the page changed a little (a section opened), the same words are
 * looked for nearby before giving up.
 */
export function resumeIndex(stored: ListenPosition | null, screen: string, sentences: readonly string[]): number {
  if (!stored || stored.screen !== screen || sentences.length === 0) return 0;
  if (sentences[stored.index] !== undefined && lead(sentences[stored.index]!) === stored.lead) return stored.index;
  const found = sentences.findIndex((s) => lead(s) === stored.lead);
  return found >= 0 ? found : 0;
}

/** A name for the screen the reader is on, from the pieces the Player puts in the page. */
export function screenKey(parts: { screen: string | null; unit: string | null; exercise: string | null; page: string | null }): string {
  return [parts.screen ?? "screen", parts.unit ?? "", parts.exercise ?? "", parts.page ?? ""].join("|");
}

export const RATES = [0.8, 1, 1.2, 1.5, 1.8, 2] as const;

export function nextRate(rate: number): number {
  const i = RATES.findIndex((r) => r >= rate - 0.001 && r <= rate + 0.001);
  return RATES[(i + 1) % RATES.length]!;
}

/** The "next" button of a paged exercise, when pressing it is a safe way to carry on listening. */
export function safeToAdvance(label: string): boolean {
  const l = label.trim().toLowerCase();
  // Never press Done, and never walk into the page where the reader's own answers go.
  return l !== "" && l !== "done" && l !== "your turn" && l !== "back";
}
