import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { createUserClient } from "@/lib/supabase/server";
import { confirmedRoles, decideStaffAccess, type PlatformRole, type StaffDecision } from "@/lib/staff-access";

export type { PlatformRole, StaffDecision } from "@/lib/staff-access";

/**
 * Staff gate for /admin (F-080).
 *
 * How roles are read. Migration 0001 keeps staff roles in platform_roles and
 * expects them mirrored into the token's app_metadata.platform_roles. Its
 * helpers (app.is_staff, app.is_platform) read that claim. The only client
 * read of platform_roles is the platform_roles_read policy, which itself
 * needs app.is_staff() to be true, so it cannot discover roles on its own.
 *
 * So the gate does two things. It reads platform_roles from the verified
 * token (getClaims checks the signature). Then it selects the caller's own
 * rows from platform_roles through the user client, which RLS allows once the
 * token says staff. A role counts only when both agree, so a role deleted
 * from the table stops working at once, even on an unexpired token.
 *
 * The second factor is required on top: the session must be aal2.
 */
export interface StaffSession {
  userId: string;
  email: string | null;
  roles: PlatformRole[];
}

export interface StaffAccess {
  decision: StaffDecision;
  session: StaffSession | null;
}

/** One read per request: the layout and the page both call this. */
export const getStaffAccess = cache(async function getStaffAccess(): Promise<StaffAccess> {
  const supabase = await createUserClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsError ? null : claimsData?.claims;
  const userId = typeof claims?.sub === "string" && claims.sub ? claims.sub : null;
  if (!userId) return { decision: "signin", session: null };

  const meta = (claims?.app_metadata ?? {}) as Record<string, unknown>;
  const tokenRoles = Array.isArray(meta.platform_roles) ? (meta.platform_roles as unknown[]) : [];

  let tableRoles: unknown[] = [];
  if (tokenRoles.length > 0) {
    const { data: rows, error } = await supabase.from("platform_roles").select("role").eq("user_id", userId);
    if (error) console.error("staff_roles_read_failed", error.code ?? "");
    tableRoles = (rows ?? []).map((r: { role: unknown }) => r.role);
  }
  const roles = confirmedRoles(tokenRoles, tableRoles);

  let aal: string | null = null;
  if (roles.length > 0) {
    const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    aal = level?.currentLevel ?? null;
  }

  const decision = decideStaffAccess({ signedIn: true, roles, aal });
  const email = typeof claims?.email === "string" ? claims.email : null;
  return { decision, session: { userId, email, roles } };
});

/**
 * For admin pages and actions: returns the staff session or leaves the
 * request. Signed out goes to sign-in, non-staff get a 404, staff without a
 * second factor go to /admin/mfa.
 */
export async function getStaffSession(next = "/admin"): Promise<StaffSession> {
  const { decision, session } = await getStaffAccess();
  if (decision === "signin") redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  if (decision === "notfound" || !session) notFound();
  if (decision === "mfa") redirect("/admin/mfa");
  return session;
}
