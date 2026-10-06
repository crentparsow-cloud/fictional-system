import { KeyRing, type SealScope } from "@akana/seal";

/**
 * Sealing helpers over the @akana/seal KeyRing. Pure: the ring is built from
 * an env object so tests can pass a throwaway key. lib/answers.ts wraps this
 * with the process environment and the request tenant, behind server-only.
 *
 * scope.field is the path from lib/answer-fields.ts. Together with the user
 * and tenant ids it forms the AAD, so a ciphertext only ever opens for the
 * reader, tenant and field it was written for.
 */

export type AnswerScope = SealScope;

export function loadKeyRing(env: Record<string, string | undefined>): KeyRing {
  if (!env.ANSWERS_KEYS || env.ANSWERS_KEYS.trim() === "") {
    throw new Error(
      "ANSWERS_KEYS is not set. Generate a key with `pnpm tsx scripts/new-seal-key.ts` on your own machine and add it to the environment as a sensitive variable. Never paste a key into a chat.",
    );
  }
  return KeyRing.fromEnv(env);
}

export async function sealValue(ring: KeyRing, scope: AnswerScope, value: unknown): Promise<{ sealed: string; keyId: string }> {
  const out = await ring.seal(value, scope);
  return { sealed: out.value, keyId: out.keyId };
}

export async function unsealValue(ring: KeyRing, scope: AnswerScope, sealed: string): Promise<unknown> {
  return ring.unseal(sealed, scope);
}
