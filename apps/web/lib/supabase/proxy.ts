import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Session refresh for the proxy, the way @supabase/ssr documents for Next
 * middleware: a server client over the request cookies, one auth.getUser()
 * call so an expired access token is refreshed, and the refreshed cookies
 * copied onto both the forwarded request and the response.
 *
 * Cookie options match lib/supabase/server.ts: __Host- prefix, Secure,
 * HttpOnly, SameSite=Lax, path "/", no Domain, so a tenant host can never
 * read the marketplace session.
 *
 * `requestHeaders` are the headers the proxy wants the route to see (tenant
 * headers included). Returns the response to send and the signed-in user id,
 * or null when nobody is signed in or Supabase is not configured.
 */
export const AUTH_COOKIE = "__Host-akana-auth";

export async function refreshSession(request: NextRequest, requestHeaders: Headers): Promise<{ response: NextResponse; userId: string | null }> {
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { response, userId: null };

  const supabase = createServerClient(url, key, {
    cookieOptions: { name: AUTH_COOKIE, secure: true, httpOnly: true, sameSite: "lax", path: "/" },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request: { headers: requestHeaders } });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });

  // Do not put code between the client creation and this call: a refreshed
  // token must reach the cookies before anything else runs.
  const { data } = await supabase.auth.getUser();
  return { response, userId: data.user?.id ?? null };
}
