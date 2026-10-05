import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client bound to the signed-in user's session. Every query through
 * this client runs under row level security. Use this for anything a reader,
 * author or publisher does.
 *
 * Cookies use the __Host- prefix through @supabase/ssr defaults plus the
 * options below: Secure, HttpOnly, SameSite=Lax, no Domain attribute, so a
 * tenant host can never read the marketplace session (architecture 3.2).
 */
export async function createUserClient() {
  const cookieStore = await cookies();
  return createServerClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    cookieOptions: { name: "__Host-akana-auth", secure: true, httpOnly: true, sameSite: "lax", path: "/" },
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

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}
