import { createHash } from "node:crypto";

/**
 * Feature flags per cohort (10.5), the pure part. A flag is a global row in
 * public.feature_flags with an on/off switch and a rollout percentage. A
 * reader's place is fixed by their id and the flag key, so they stay in or out
 * from one visit to the next, and raising the percentage only adds readers.
 *
 * The number is the first four bytes of sha256("<key>:<user id>") read as an
 * unsigned big-endian integer, mod 100. Migration 0064 (app.flag_bucket)
 * computes the same value, and flags.test.ts pins both to the same figures.
 */

export const COHORT_FLAGS = ["reader_passkeys", "web_push", "programme_friends"] as const;
export type CohortFlag = (typeof COHORT_FLAGS)[number];

export function isCohortFlag(key: unknown): key is CohortFlag {
  return typeof key === "string" && (COHORT_FLAGS as readonly string[]).includes(key);
}

export const FLAG_LABELS: Record<CohortFlag, { name: string; line: string }> = {
  reader_passkeys: { name: "Passkeys for readers", line: "Offers a passkey as an extra check after sign-in. Needs the mfa_passkey switch on as well." },
  web_push: { name: "Daily step notification", line: "A plain notification on the reader's chosen reminder days, for installed readers who ask for it. Needs the VAPID keys." },
  programme_friends: { name: "Do a programme with a friend", line: "Invite links, finished-today status and pre-written nudges between two readers." },
};

export interface FlagRow {
  enabled: boolean;
  rolloutPercent: number;
}

/** 0 to 99, the same for the same reader and key every time. */
export function flagBucket(userId: string, key: string): number {
  const digest = createHash("sha256").update(`${key}:${userId}`, "utf8").digest();
  return digest.readUInt32BE(0) % 100;
}

/** Whether a reader (or nobody, signed out) is in the flag. A missing row is off. */
export function flagOn(row: FlagRow | null | undefined, key: string, userId: string | null | undefined): boolean {
  if (!row || !row.enabled) return false;
  if (row.rolloutPercent >= 100) return true;
  if (row.rolloutPercent <= 0 || !userId) return false;
  return flagBucket(userId, key) < row.rolloutPercent;
}

/** Percent from a form field: a whole number 0 to 100, else null. */
export function parsePercent(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^\d{1,3}$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= 0 && n <= 100 ? n : null;
}

/** The line staff see next to a flag: who is in it. */
export function rolloutLine(row: FlagRow): string {
  if (!row.enabled) return "Off for everyone.";
  if (row.rolloutPercent >= 100) return "On for everyone.";
  if (row.rolloutPercent <= 0) return "On, but with 0 percent of readers, so effectively off.";
  return `On for ${row.rolloutPercent} percent of signed-in readers. Signed-out visitors are not included.`;
}
