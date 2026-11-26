/**
 * The second-factor rule for a reader's private work (review M3), the pure
 * part. One rule, used by the reader layout and by every server path that
 * serves or changes answers, marks, "Then and now" entries, the export and
 * the account's data:
 *
 *   no verified factor on the account         allowed at the first factor
 *   a verified factor, session at aal1        refused
 *   a verified factor, session at aal2        allowed
 *
 * Before this, only the layout asked. A session that had given the password
 * or the email link but not the code could still call the routes directly.
 *
 * Cost: whether the account has a factor comes from the user the path has
 * already loaded. The session's level is read from the token, and only when
 * the account has a factor, so a reader without two-step sign-in pays
 * nothing extra.
 */
export const SECOND_FACTOR_REQUIRED = "second_factor_required";
export const SECOND_FACTOR_MESSAGE = "Enter your sign-in code to carry on. Your work is safe.";

export type FactorLike = { factor_type?: string; status?: string };

/**
 * Does the account have a second factor that counts? A passkey counts only
 * while passkeys are switched on, so turning the switch off can never lock
 * out a reader whose only factor is a passkey. `passkeysOn` is asked only
 * when the answer depends on it.
 */
export async function hasSecondFactor(factors: readonly FactorLike[] | null | undefined, passkeysOn: () => Promise<boolean>): Promise<boolean> {
  const verified = (factors ?? []).filter((f) => f.status === "verified");
  if (verified.some((f) => f.factor_type !== "webauthn")) return true;
  return verified.length > 0 && (await passkeysOn());
}

/** True when the account has a factor and this session has not given it. `sessionVerified` is not called otherwise. */
export async function secondFactorMissing(mfaEnrolled: boolean, sessionVerified: () => Promise<boolean>): Promise<boolean> {
  if (!mfaEnrolled) return false;
  return !(await sessionVerified());
}
