import { VERIFY_PATH } from "@/lib/mfa/role-mfa";

/**
 * Optional two-step sign-in for readers (13.2), the pure part. A reader
 * turns it on from /you/security. Supabase Auth holds the TOTP factor, the
 * same one owners and staff use; Akana adds recovery codes (0037). It is
 * never required for a reader.
 */

export const READER_SECURITY_PATH = "/you/security";

/** The verify page for a reader, coming back to `next`. Readers get reader copy there. */
export function readerVerifyHref(next: string): string {
  const safe = next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/home";
  return `${VERIFY_PATH}?for=reader&next=${encodeURIComponent(safe)}`;
}

/** Notices /you/security shows after an action. Unknown values show nothing. */
export const SECURITY_NOTICES = {
  off: "Two-step sign-in is off. Your authenticator app no longer works for Akana, and your recovery codes are gone.",
  recovered: "You signed in with a recovery code, so two-step sign-in has been turned off. Set it up again when you have a new authenticator.",
  "off-failed": "Two-step sign-in could not be turned off just now. Try again in a moment.",
} as const;

export type SecurityNotice = keyof typeof SECURITY_NOTICES;

export function securityNoticeText(code: string | string[] | undefined): string | null {
  const c = Array.isArray(code) ? code[0] : code;
  return c && c in SECURITY_NOTICES ? SECURITY_NOTICES[c as SecurityNotice] : null;
}
