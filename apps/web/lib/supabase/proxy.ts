import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decodeJwtClaims, isSessionCookieName, scopeDecision, TENANT_CLAIM, TENANT_READER_ROLE } from "@/lib/session-scope";
import { loadTenantSession, revokeTenantSession, tenantCookieAdapter, TENANT_SESSION_COOKIE, tenantStoreFromEnv, type TenantStore } from "@/lib/tenant-session-store";

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
 *
 * Session scope (F-133, lib/session-scope.ts). `host` says what the proxy
 * resolved for this request.
 *
 *   marketplace   the session is in `__Host-akana-auth`, as ever. After the
 *                 refresh its claims are checked: a tenant-scoped token is
 *                 removed (dropped from the forwarded request and cleared in
 *                 the browser), so no page, action or route handler behind
 *                 the proxy ever sees it. Every other session passes
 *                 untouched. The tenant cookie is never read here.
 *   tenant host   `__Host-akana-auth` is never accepted: it is dropped from
 *                 the forwarded request whatever it holds. The session comes
 *                 from the server-side store, by the opaque id in
 *                 `__Host-akana-tenant-session`, looked up with this tenant
 *                 (lib/tenant-session-store.ts). It is refreshed there, and
 *                 only a verified tenant_reader token for this tenant
 *                 passes. Anything else (an unknown, expired or revoked id,
 *                 another tenant's id, a refresh that came back unscoped
 *                 because the hook is off) revokes the stored row, clears
 *                 the browser's cookie and forwards no session.
 *
 * `rewriteTo` makes the response a rewrite to that URL instead of a plain
 * pass-through; the tenant site's pages are served that way.
 */
export const AUTH_COOKIE = "__Host-akana-auth";

export type ProxyHost = { kind: "marketplace" | "white_label"; tenantId: string | null };

export async function refreshSession(
  request: NextRequest,
  requestHeaders: Headers,
  host: ProxyHost = { kind: "marketplace", tenantId: null },
  rewriteTo?: URL,
  deps: { store?: TenantStore | null } = {},
): Promise<{ response: NextResponse; userId: string | null }> {
  const make = () => (rewriteTo ? NextResponse.rewrite(rewriteTo, { request: { headers: requestHeaders } }) : NextResponse.next({ request: { headers: requestHeaders } }));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (host.kind === "white_label") return refreshTenantSession(request, requestHeaders, host, make, url, key, deps.store === undefined ? tenantStoreFromEnv() : deps.store);

  let response = make();
  if (!url || !key) return { response, userId: null };

  const supabase = createServerClient(url, key, {
    cookieOptions: { name: AUTH_COOKIE, secure: true, httpOnly: true, sameSite: "lax", path: "/" },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = make();
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });

  // Do not put code between the client creation and this call: a refreshed
  // token must reach the cookies before anything else runs.
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id ?? null;

  // F-133. The marketplace changes for tenant tokens only. This also catches
  // one that getUser would not vouch for: removing a cookie needs no proof.
  let claims: ReturnType<typeof decodeJwtClaims> = null;
  try {
    claims = decodeJwtClaims((await supabase.auth.getSession()).data.session?.access_token);
  } catch {
    claims = null;
  }
  const refuse = Boolean(claims) && (claims?.role === TENANT_READER_ROLE || Object.prototype.hasOwnProperty.call(claims, TENANT_CLAIM));
  if (!refuse) return { response, userId };

  const removed = stripSessionCookies(request, requestHeaders);
  response = make();
  for (const name of removed) response.cookies.set(name, "", { path: "/", secure: true, httpOnly: true, sameSite: "lax", maxAge: 0 });
  response.headers.set("Cache-Control", "private, no-store");
  return { response, userId: null };
}

/** The tenant-host half: the session comes from the store, never from the browser. */
async function refreshTenantSession(
  request: NextRequest,
  requestHeaders: Headers,
  host: ProxyHost,
  make: () => NextResponse,
  url: string | undefined,
  key: string | undefined,
  store: TenantStore | null,
): Promise<{ response: NextResponse; userId: string | null }> {
  const opaque = request.cookies.get(TENANT_SESSION_COOKIE)?.value;
  // A Supabase session cookie is never accepted on a tenant host.
  stripSessionCookies(request, requestHeaders, { keepTenantCookie: true });

  const signedOut = (clear: boolean): { response: NextResponse; userId: null } => {
    stripSessionCookies(request, requestHeaders);
    const response = make();
    if (clear) response.cookies.set(TENANT_SESSION_COOKIE, "", { path: "/", secure: true, httpOnly: true, sameSite: "lax", maxAge: 0 });
    response.headers.set("Cache-Control", "private, no-store");
    return { response, userId: null };
  };

  if (!opaque) return signedOut(false);
  // Nothing can be verified without Supabase and the store: no session, cookie left alone.
  if (!url || !key || !store) return signedOut(false);

  let loaded: Awaited<ReturnType<typeof loadTenantSession>> = null;
  try {
    loaded = await loadTenantSession(store, opaque, host.tenantId);
  } catch {
    // The store could not be read. Signed out for this request; the id is kept.
    return signedOut(false);
  }
  if (!loaded) return signedOut(true);

  const adapter = tenantCookieAdapter(store, loaded);
  const supabase = createServerClient(url, key, {
    cookieOptions: { name: AUTH_COOKIE, secure: true, httpOnly: true, sameSite: "lax", path: "/" },
    cookies: { getAll: adapter.getAll, setAll: (list) => adapter.setAll(list) },
  });

  let ok = false;
  let userId: string | null = null;
  try {
    // Refreshes when the token has expired; the adapter stores the result.
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
    // The token read here is the one getUser has just verified, or one
    // Supabase Auth issued a moment ago in the refresh above.
    const claims = decodeJwtClaims((await supabase.auth.getSession()).data.session?.access_token);
    ok = Boolean(userId && claims && claims.sub === userId && userId === loaded.userId && scopeDecision(host, claims).ok) && !adapter.ended();
  } catch {
    ok = false;
  }
  if (!ok) {
    // Not this tenant's scoped session any more (hook off, revoked, user gone): the row is dead for good.
    try {
      await revokeTenantSession(store, loaded.idHash);
    } catch {
      // The cookie is cleared below either way.
    }
    return signedOut(true);
  }
  return { response: make(), userId };
}

/**
 * Drops every session cookie from the request the route will see: the
 * Supabase session cookie and its chunks, and the tenant cookie unless told
 * to keep it. Returns the Supabase cookie names removed. The browser's copy
 * is not touched here.
 */
export function stripSessionCookies(request: NextRequest, requestHeaders: Headers, opts: { keepTenantCookie?: boolean } = {}): string[] {
  const names = request.cookies
    .getAll()
    .map((c) => c.name)
    .filter((n) => isSessionCookieName(n, AUTH_COOKIE));
  for (const name of names) request.cookies.delete(name);
  if (!opts.keepTenantCookie) request.cookies.delete(TENANT_SESSION_COOKIE);
  syncCookieHeader(request, requestHeaders);
  return names;
}

function syncCookieHeader(request: NextRequest, requestHeaders: Headers): void {
  const cookie = request.cookies.toString();
  if (cookie) requestHeaders.set("cookie", cookie);
  else requestHeaders.delete("cookie");
}
