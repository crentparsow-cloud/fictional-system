/**
 * Staff access decision (F-080), kept pure so it can be unit tested without
 * Next or Supabase. lib/staff.ts gathers the inputs and acts on the answer.
 *
 * Order matters. No session goes to sign-in. A signed-in account with no
 * staff role gets a 404, so admin does not admit it exists. Staff without a
 * second factor on this session go to /admin/mfa. Only then is access given.
 */

export const PLATFORM_ROLES = ["owner", "editor", "safety_reviewer", "support", "finance"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export type StaffDecision = "signin" | "notfound" | "mfa" | "ok";

export interface StaffAccessInput {
  /** True when a verified session exists. */
  signedIn: boolean;
  /** Roles from the caller's token, confirmed against platform_roles. */
  roles: readonly string[];
  /** The session's current assurance level, from Supabase Auth. */
  aal: string | null | undefined;
}

export function decideStaffAccess(input: StaffAccessInput): StaffDecision {
  if (!input.signedIn) return "signin";
  if (knownRoles(input.roles).length === 0) return "notfound";
  if (input.aal !== "aal2") return "mfa";
  return "ok";
}

/** Keep only the five fixed roles, once each, in a stable order. */
export function knownRoles(roles: readonly unknown[] | null | undefined): PlatformRole[] {
  if (!roles) return [];
  const set = new Set(roles.filter((r): r is string => typeof r === "string"));
  return PLATFORM_ROLES.filter((r) => set.has(r));
}

/**
 * A role counts only when the token carries it and the platform_roles table
 * still holds it. The token alone could be stale after a revocation; the
 * table alone is only readable when the token already says staff.
 */
export function confirmedRoles(tokenRoles: readonly unknown[] | null | undefined, tableRoles: readonly unknown[] | null | undefined): PlatformRole[] {
  const table = new Set(knownRoles(tableRoles));
  return knownRoles(tokenRoles).filter((r) => table.has(r));
}

export const ROLE_LABELS: Record<PlatformRole, string> = {
  owner: "Owner",
  editor: "Editor",
  safety_reviewer: "Safety reviewer",
  support: "Support",
  finance: "Finance",
};

/** A six-digit authenticator code, spaces allowed. Returns the digits or null. */
export function cleanTotpCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\s+/g, "");
  return /^[0-9]{6}$/.test(digits) ? digits : null;
}
