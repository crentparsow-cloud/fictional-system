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
 * expects them mirrored into the token's app_metadata.platform_roles.
 *
 * The gate reads platform_roles from the verified token (getClaims checks the
 * signature). Then it selects the caller's own rows from platform_roles
 * through the user client. A role counts only when both agree, so a role
 * deleted from the table stops working at once, even on an unexpired token.
 *
 * The second factor is required on top: the session must be aal2.
 *
 * From migration 0074 the database applies the same three rules itself
 * (app.platform_roles: token, table and a second-factor session), so a staff
 * function called straight on the API is held to them too. The own-rows read
 * above is allowed at the first-factor level by the platform_roles_read_own
 * policy; that is what lets this gate send staff who have not verified yet to
 * /admin/mfa instead of a 404. Nothing else is open to them until they verify.
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
