import "server-only";
import type { KeyRing } from "@akana/seal";
import { loadKeyRing, sealValue, unsealValue, type AnswerScope } from "@/lib/sealing";

/**
 * Server-side sealing for reader answers (F-134).
 *
 * The key ring comes from ANSWERS_KEYS and is built once per server process.
 * Nothing here logs key material or plaintext. Unsealing happens only in
 * route handlers acting for the signed-in owner, after the enrolment has
 * been read through the user's own client under RLS.
 */

let ring: KeyRing | null = null;

export function answerKeyRing(): KeyRing {
  if (!ring) ring = loadKeyRing(process.env);
  return ring;
}

export type { AnswerScope };

export async function seal(scope: AnswerScope, value: unknown): Promise<{ sealed: string; keyId: string }> {
  return sealValue(answerKeyRing(), scope, value);
}

export async function unseal(scope: AnswerScope, sealed: string): Promise<unknown> {
  return unsealValue(answerKeyRing(), scope, sealed);
}

/** Largest JSON an answer may be, in bytes. Long text fields sit well under this. */
export const MAX_ANSWER_BYTES = 32 * 1024;
