/**
 * Role second factor (F-143), the pure part.
 *
 * Organisation owners and finance members, and Akana staff, need a session
 * that passed a second factor (Supabase Auth MFA, aal2) before they change
 * money or membership in /console, /org or /studio. Migration 0032 checks
 * the same claims in app.session_mfa_verified, so the database refuses
 * even if the app check is skipped. Payout changes need more: a fresh code
 * within ten minutes (lib/payouts/step-up.ts).
 */

/** Organisation roles that need a second factor. Readers, editors, authors and viewers do not. */
export const MFA_ROLES: readonly string[] = ["owner", "finance"];

/** AMR methods that count as a second factor. Supabase writes "totp" for TOTP and "mfa/webauthn" for a passkey. */
export const MFA_METHODS: readonly string[] = ["totp", "mfa/totp", "webauthn", "mfa/webauthn"];

/** The error code 0032 raises when the session has no second factor. */
export const ROLE_MFA_ERRCODE = "AKM01";

/** Where the app sends someone to verify. */
export const VERIFY_PATH = "/verify";

export interface MfaClaims {
  aal?: unknown;
  amr?: unknown;
}

export function roleNeedsMfa(role: string | null | undefined, isStaff = false): boolean {
  return isStaff || (typeof role === "string" && MFA_ROLES.includes(role));
}

function amrMethod(entry: unknown): string | null {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") {
    const m = (entry as { method?: unknown }).method;
    return typeof m === "string" ? m : null;
  }
  return null;
}

/** True when the token says aal2 and names a second factor. Mirrors app.session_mfa_verified. */
export function sessionMfaVerified(claims: MfaClaims | null | undefined): boolean {
  if (!claims || claims.aal !== "aal2" || !Array.isArray(claims.amr)) return false;
  return (claims.amr as unknown[]).some((e) => {
    const m = amrMethod(e);
    return m !== null && MFA_METHODS.includes(m);
  });
}

export function isRoleMfaError(code: string | null | undefined): boolean {
  return code === ROLE_MFA_ERRCODE;
}

/** The verify page, coming back to `next` afterwards. Only same-site paths are kept. */
export function verifyHref(next: string): string {
  const safe = next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/studio";
  return `${VERIFY_PATH}?next=${encodeURIComponent(safe)}`;
}
