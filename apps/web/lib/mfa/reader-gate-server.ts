import "server-only";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getRoleMfaSession, passkeyEnabled } from "@/lib/mfa/role-mfa-server";
import { hasSecondFactor, secondFactorMissing, SECOND_FACTOR_MESSAGE, SECOND_FACTOR_REQUIRED, type FactorLike } from "@/lib/mfa/reader-gate";
import { readerVerifyHref } from "@/lib/mfa/reader-mfa";

/**
 * The second-factor rule for a reader's private work, the server part
 * (review M3). The rule itself is in lib/mfa/reader-gate.ts.
 */

/** Whether the signed-in user has a second factor that counts. Reads the user object already loaded. */
export function mfaEnrolledFor(user: unknown): Promise<boolean> {
  const factors = (user as { factors?: FactorLike[] } | null)?.factors ?? [];
  return hasSecondFactor(factors, passkeyEnabled);
}

/** True when this reader turned on two-step sign-in and the session has not given a code. */
export function readerSecondFactorMissing(session: { mfaEnrolled: boolean }): Promise<boolean> {
  return secondFactorMissing(session.mfaEnrolled, async () => (await getRoleMfaSession()).verified);
}

/** The refusal for a route: 403 with a code the reading page understands, and where to give the code. */
export function secondFactorRefusal(): NextResponse {
  return NextResponse.json(
    { error: SECOND_FACTOR_REQUIRED, message: SECOND_FACTOR_MESSAGE, verify: readerVerifyHref("/home") },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}

/** For a route: the refusal, or null when the reader may go on. */
export async function readerFactorRefusal(session: { mfaEnrolled: boolean }): Promise<NextResponse | null> {
  return (await readerSecondFactorMissing(session)) ? secondFactorRefusal() : null;
}

/** For a server action that loaded the user itself: leave for the verify page when the code is owed. */
export async function requireReaderFactor(user: unknown, next: string): Promise<void> {
  if (await readerSecondFactorMissing({ mfaEnrolled: await mfaEnrolledFor(user) })) redirect(readerVerifyHref(next));
}
