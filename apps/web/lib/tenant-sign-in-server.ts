import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { tenantRequest } from "@/lib/tenant-reader";
import { completeTenantSignIn, type EstablishedSession, type TenantSignInResult } from "@/lib/tenant-sign-in";
import { createTenantSession, SUPABASE_AUTH_COOKIE, TENANT_SESSION_COOKIE, TENANT_SESSION_COOKIE_OPTIONS, tenantStoreFromEnv } from "@/lib/tenant-session-store";

/**
 * Supabase wiring for the tenant-host sign-in (F-133). The order of steps is
 * lib/tenant-sign-in.ts; this file supplies the effects. Call it only after
 * Akana's own code for this tenant and address has checked out
 * (lib/tenant-code-server.ts): that check is the proof of the address.
 *
 * establish. The server makes the session itself. With the service role it
 * asks Supabase Auth for a one-time token for the address
 * (auth.admin.generateLink, which sends no email), creating the account
 * first when the address is new (createUser with the email confirmed, since
 * the code has just proved it). It then spends that token at once
 * (verifyOtp with the token hash) on a client whose "cookies" are a map in
 * memory. Nothing Supabase issued is sent to the reader or to the browser.
 *
 * commit. The session in that map is sealed into the server-side store and
 * the browser is given an opaque id (lib/tenant-session-store.ts). With no
 * store (TENANT_SESSION_KEYS blank) nothing is tried at all.
 *
 * The tenant and host come from the proxy's headers.
 */
export async function signInOnTenantHost(email: string): Promise<TenantSignInResult> {
  const req = await tenantRequest();
  // Sign-in is off for this tenant, or this is not a tenant host: nothing is tried.
  if (!req || !req.signIn) return { ok: false, reason: "register" };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const store = tenantStoreFromEnv();
  if (!url || !key || !store) return { ok: false, reason: "store" };

  // What @supabase/ssr would write to cookies, held here and nowhere else.
  const pending = new Map<string, string>();
  const supabase = createServerClient(url, key, {
    cookieOptions: { name: SUPABASE_AUTH_COOKIE, secure: true, httpOnly: true, sameSite: "lax", path: "/" },
    cookies: {
      getAll: () => [...pending].map(([name, value]) => ({ name, value })),
      setAll: (list) => {
        for (const { name, value } of list) {
          if (value === "") pending.delete(name);
          else pending.set(name, value);
        }
      },
    },
  });

  return completeTenantSignIn({
    tenantId: req.tenantId,
    host: req.host,
    establish: async (): Promise<EstablishedSession | null> => {
      const admin = createAdminClient();
      let link = await admin.auth.admin.generateLink({ type: "magiclink", email });
      if (link.error || !link.data?.properties?.hashed_token) {
        // No account yet for this address. The code proved the address, so it is confirmed.
        const created = await admin.auth.admin.createUser({ email, email_confirm: true });
        if (created.error) {
          console.error("tenant_sign_in_create_user_failed", created.error.status ?? "", created.error.name);
          return null;
        }
        link = await admin.auth.admin.generateLink({ type: "magiclink", email });
      }
      const props = link.data?.properties;
      if (link.error || !props?.hashed_token) {
        console.error("tenant_sign_in_link_failed", link.error?.status ?? "", link.error?.name ?? "");
        return null;
      }
      const { data, error } = await supabase.auth.verifyOtp({ token_hash: props.hashed_token, type: props.verification_type === "signup" ? "signup" : "magiclink" });
      if (error || !data.session || !data.user) {
        console.error("tenant_sign_in_verify_failed", error?.status ?? "", error?.name ?? "");
        return null;
      }
      // The session must be for the address that passed the code, and nobody else.
      if ((data.user.email ?? "").toLowerCase() !== email.toLowerCase()) return null;
      const factors = (data.user as { factors?: { status?: string }[] }).factors ?? [];
      return { accessToken: data.session.access_token, userId: data.user.id, hasVerifiedFactor: factors.some((f) => f.status === "verified") };
    },
    registerScope: async (row) => {
      const { data, error } = await createAdminClient().rpc("register_tenant_session", {
        p_session: row.sessionId,
        p_user: row.userId,
        p_tenant: row.tenantId,
        p_host: row.host,
      });
      if (error) console.error("tenant_session_register_failed", error.code ?? "");
      return !error && data === true;
    },
    refresh: async () => {
      const { data, error } = await supabase.auth.refreshSession();
      return error ? null : (data.session?.access_token ?? null);
    },
    verify: async (accessToken) => {
      const { data } = await supabase.auth.getUser(accessToken);
      return data.user?.id ?? null;
    },
    signOut: async () => {
      await supabase.auth.signOut({ scope: "local" });
    },
    commit: async ({ sessionId, userId }) => {
      const opaque = await createTenantSession(store, { tenantId: req.tenantId, userId, sessionId, cookies: Object.fromEntries(pending) });
      if (!opaque) return false;
      (await cookies()).set(TENANT_SESSION_COOKIE, opaque, TENANT_SESSION_COOKIE_OPTIONS);
      return true;
    },
  });
}
