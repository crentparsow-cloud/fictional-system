"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createUserClient } from "@/lib/supabase/server";
import { tenantRequest } from "@/lib/tenant-reader";
import { hashOpaqueId, revokeTenantSession, TENANT_SESSION_COOKIE, tenantStoreFromEnv } from "@/lib/tenant-session-store";

/**
 * Signs the reader out of this site on this device (F-133). Three things
 * end together: the Supabase session (scope "local": this one session, which
 * also removes its scope row, migration 0073), the stored row behind the
 * browser's opaque id, and the cookie. Sessions on the Akana site and on
 * other sites are not touched.
 */
export async function signOutOfTenant(): Promise<void> {
  const jar = await cookies();
  const opaque = jar.get(TENANT_SESSION_COOKIE)?.value;
  try {
    // On a tenant host this client is served from the store, so the sign-out reaches Supabase with the stored session.
    const supabase = await createUserClient();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    console.error("tenant_sign_out_failed");
  }
  // Whatever happened above, the stored row is revoked and the cookie goes.
  try {
    const store = tenantStoreFromEnv();
    if (store && opaque && (await tenantRequest())) await revokeTenantSession(store, await hashOpaqueId(opaque));
  } catch {
    console.error("tenant_session_revoke_failed");
  }
  jar.delete({ name: TENANT_SESSION_COOKIE, path: "/" });
  redirect("/");
}
