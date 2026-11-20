import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { loadTenantSession, SUPABASE_AUTH_COOKIE, tenantCookieAdapter, TENANT_SESSION_COOKIE, tenantStoreFromEnv } from "@/lib/tenant-session-store";

/**
 * Supabase client bound to the signed-in user's session. Every query through
 * this client runs under row level security. Use this for anything a reader,
 * author or publisher does.
 *
 * On the Akana site the session is in cookies with the __Host- prefix
 * through @supabase/ssr defaults plus the options below: Secure, HttpOnly,
 * SameSite=Lax, no Domain attribute, so a tenant host can never read the
 * marketplace session (architecture 3.2).
 *
 * On a white-label tenant host (F-133) the session is not in the browser at
 * all. The browser holds an opaque id; the session comes from the server-side
 * store, looked up with the tenant the proxy resolved
 * (lib/tenant-session-store.ts). `__Host-akana-auth` is never read on a
 * tenant host, and the tenant cookie is never read on the Akana site. With
 * no valid id the client is simply signed out.
 */
export async function createUserClient() {
  const cookieStore = await cookies();
  const cookieOptions = { name: SUPABASE_AUTH_COOKIE, secure: true, httpOnly: true, sameSite: "lax", path: "/" } as const;

  if (await onTenantHost()) {
    const h = await headers();
    const store = tenantStoreFromEnv();
    const loaded = store ? await loadTenantSession(store, cookieStore.get(TENANT_SESSION_COOKIE)?.value, (h.get("x-akana-tenant-id") ?? "").toLowerCase()) : null;
    const adapter = tenantCookieAdapter(store, loaded);
    return createServerClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
      cookieOptions,
      // The store, not the browser: a refreshed token is sealed and kept on the server.
      cookies: { getAll: adapter.getAll, setAll: (list) => adapter.setAll(list) },
    });
  }

  return createServerClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    cookieOptions,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  });
}

/** True on a white-label host, as the proxy marked the request. Anything else is the Akana site. */
async function onTenantHost(): Promise<boolean> {
  try {
    return (await headers()).get("x-akana-tenant-kind") === "white_label";
  } catch {
    return false;
  }
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}
