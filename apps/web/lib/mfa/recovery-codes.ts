import { createHash, randomInt } from "node:crypto";

/**
 * Recovery codes for a reader's optional two-step sign-in (13.2), the pure
 * part. Eight codes of ten characters from an alphabet without 0, O, 1, I
 * or L, shown as XXXXX-XXXXX. About 47 bits each, so a plain SHA-256 of the
 * normalised code is enough to store; the database (0037) keeps the hashes
 * and never the codes, and limits guesses to ten an hour.
 */

export const RECOVERY_CODE_COUNT = 8;
export const RECOVERY_CODE_LENGTH = 10;
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Fresh codes, formatted for display. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT, rand: (max: number) => number = randomInt): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    let raw = "";
    for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) raw += ALPHABET[rand(ALPHABET.length)];
    codes.add(formatRecoveryCode(raw));
  }
  return [...codes];
}

/** XXXXX-XXXXX from the ten raw characters. */
export function formatRecoveryCode(raw: string): string {
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

/**
 * What a reader typed, as the ten upper-case characters, or null when it
 * cannot be a code. Spaces, dashes and case are forgiven. A character
 * outside the alphabet means it is not one of our codes.
 */
export function normaliseRecoveryCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 40) return null;
  const cleaned = input.toUpperCase().replace(/[\s-]+/g, "");
  if (cleaned.length !== RECOVERY_CODE_LENGTH) return null;
  return [...cleaned].every((c) => ALPHABET.includes(c)) ? cleaned : null;
}

/** SHA-256 hex of a normalised code, the value stored and compared. */
export function hashRecoveryCode(normalised: string): string {
  return createHash("sha256").update(normalised, "utf8").digest("hex");
}
