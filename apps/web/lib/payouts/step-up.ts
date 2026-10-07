/**
 * Step-up for payout changes (F-143), the pure part.
 *
 * A session that reached aal2 hours ago is not enough to change where money
 * goes. Supabase Auth lists the methods used in the token's amr claim with
 * the time each was last verified, and verifying a fresh TOTP challenge moves
 * that time forward. A change is allowed when the session is aal2 and TOTP
 * was verified within the window. migration 0014 checks the same in
 * app.recent_step_up, so the database refuses even if this check is skipped.
 */

export const STEP_UP_MAX_AGE_SECONDS = 600;

export interface StepUpClaims {
  aal?: unknown;
  amr?: unknown;
}

/** Seconds since TOTP was last verified on this session, or null when it never was. */
export function totpAgeSeconds(claims: StepUpClaims | null | undefined, nowMs: number = Date.now()): number | null {
  if (!claims || !Array.isArray(claims.amr)) return null;
  let latest: number | null = null;
  for (const entry of claims.amr as unknown[]) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as { method?: unknown; timestamp?: unknown };
    if (e.method !== "totp" || typeof e.timestamp !== "number" || !Number.isFinite(e.timestamp)) continue;
    if (latest === null || e.timestamp > latest) latest = e.timestamp;
  }
  if (latest === null) return null;
  return Math.max(0, Math.floor(nowMs / 1000) - latest);
}

export function hasRecentStepUp(claims: StepUpClaims | null | undefined, nowMs: number = Date.now(), maxAge = STEP_UP_MAX_AGE_SECONDS): boolean {
  if (!claims || claims.aal !== "aal2") return false;
  const age = totpAgeSeconds(claims, nowMs);
  return age !== null && age <= maxAge;
}
