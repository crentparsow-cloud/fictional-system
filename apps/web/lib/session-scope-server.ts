import "server-only";
import type { User } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { decodeJwtClaims, scopeDecision, type JwtClaims, type SessionScope } from "@/lib/session-scope";
import { createUserClient } from "@/lib/supabase/server";
import { tenantIdFromHeaders } from "@/lib/tenant-id";

/**
 * Who is signed in, for this host (F-133). The server half of the session
 * scope rule in lib/session-scope.ts, and the one place a server path asks
 * the question. getReaderSession (lib/auth.ts) and the tenant reader pages
 * go through here; the proxy applies the same rule one step earlier and
 * removes a session that fails it, so paths that still call
 * supabase.auth.getUser() directly never see one either.
 *
 * How the claims are verified. The access token is read from the session,
 * then that exact token is sent to Supabase Auth (getUser(token)), which
 * checks the signature, the expiry and that the session still exists. Only
 * after that is its payload read. The claims therefore come from a verified
 * token, never from a cookie taken on trust. The token's subject must be the
 * user Supabase returned.
 *
 * The host comes from the proxy's headers: the tenant kind and the tenant id
 * the proxy resolved. Nothing here reads a tenant from the browser. A
 * request with no kind header did not come through the proxy and is treated
 * as signed out.
 */
export type UserClient = Awaited<ReturnType<typeof createUserClient>>;

export interface ScopedUser {
  user: User;
  claims: JwtClaims;
  /** "account" on the marketplace, "tenant" on a white-label host. */
  scope: SessionScope;
  /** The request's tenant id, as the proxy resolved it. */
  tenantId: string | null;
  supabase: UserClient;
}

export interface VerifiedClaimsSource {
  auth: {
    getSession: () => Promise<{ data: { session: { access_token: string } | null } }>;
    getUser: (jwt?: string) => Promise<{ data: { user: User | null } }>;
  };
}

/** The user and the claims of the session's access token, once Supabase Auth has verified that token. */
export async function verifiedClaims(supabase: VerifiedClaimsSource): Promise<{ user: User; claims: JwtClaims } | null> {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) return null;
  const { data } = await supabase.auth.getUser(token);
  if (!data.user) return null;
  const claims = decodeJwtClaims(token);
  if (!claims || claims.sub !== data.user.id) return null;
  return { user: data.user, claims };
}

/** The signed-in user if their session may be used on this host, otherwise null. Never throws. */
export async function getScopedUser(): Promise<ScopedUser | null> {
  try {
    const h = await headers();
    const kind = h.get("x-akana-tenant-kind");
    const tenantId = tenantIdFromHeaders(h.get("x-akana-tenant"), h.get("x-akana-tenant-id"));
    const supabase = await createUserClient();
    const verified = await verifiedClaims(supabase as unknown as VerifiedClaimsSource);
    if (!verified) return null;
    const decision = scopeDecision({ kind, tenantId }, verified.claims);
    if (!decision.ok) return null;
    return { user: verified.user, claims: verified.claims, scope: decision.scope, tenantId, supabase };
  } catch {
    return null;
  }
}
