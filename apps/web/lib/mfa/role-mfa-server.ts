import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createUserClient } from "@/lib/supabase/server";
import { roleNeedsMfa, sessionMfaVerified, verifyHref, type MfaClaims } from "@/lib/mfa/role-mfa";

/**
 * Role second factor (F-143), the server part. Actions call requireRoleMfa
 * before any money or membership change; the 0032 functions refuse on their
 * own as well.
 */

export interface RoleMfaSession {
  verified: boolean;
  isStaff: boolean;
}

/** Read from the verified token (getClaims checks the signature). One read per request. */
export const getRoleMfaSession = cache(async function getRoleMfaSession(): Promise<RoleMfaSession> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = error ? null : ((data?.claims ?? null) as (MfaClaims & { app_metadata?: unknown }) | null);
  const meta = (claims?.app_metadata ?? {}) as Record<string, unknown>;
  const isStaff = Array.isArray(meta.platform_roles) && meta.platform_roles.length > 0;
  return { verified: sessionMfaVerified(claims), isStaff };
});

/**
 * For actions: leave for the verify page when this role needs a second
 * factor and the session has none. `next` is where to come back to.
 */
export async function requireRoleMfa(role: string | null | undefined, next: string): Promise<void> {
  const s = await getRoleMfaSession();
  if (roleNeedsMfa(role, s.isStaff) && !s.verified) redirect(verifyHref(next));
}

/** For the console banners: does this person need a second factor, and is it missing on this session. */
export async function roleMfaMissing(): Promise<boolean> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("role_mfa_status");
  if (error) return false;
  const row = (Array.isArray(data) ? data[0] : data) as { required?: boolean; verified?: boolean } | undefined;
  return Boolean(row?.required) && !row?.verified;
}

/** Whether passkeys may be offered as a second factor (flag mfa_passkey, off by default). */
export async function passkeyEnabled(): Promise<boolean> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("mfa_passkey_open");
  return !error && data === true;
}
