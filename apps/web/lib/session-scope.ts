/**
 * The session scope rule (F-133). One check, used by the proxy and by every
 * server path that asks who is signed in (lib/session-scope-server.ts).
 *
 * A session created on a white-label tenant host carries two claims, put
 * there by the access token hook (migration 0073): role "tenant_reader" and
 * akana_tenant, the tenant's uuid. Such a session is good on that tenant's
 * host and nowhere else:
 *
 *   tenant host   the role must be tenant_reader and akana_tenant must equal
 *                 the tenant the proxy resolved for the request. Anything
 *                 else, an ordinary Akana session included, is signed out.
 *   marketplace   a token with role tenant_reader, or with an akana_tenant
 *                 claim of any kind, is signed out. A stolen tenant cookie
 *                 replayed against the Akana site gets nothing.
 *
 * The claims passed in must come from a token Supabase Auth has verified
 * (getUser with that token) or has just issued. decodeJwtClaims does not
 * verify anything by itself. No Node APIs and no next/* imports, so the
 * proxy can use it on any runtime. docs/TENANT_SIGN_IN.md has the design.
 */

export const TENANT_READER_ROLE = "tenant_reader";
export const TENANT_CLAIM = "akana_tenant";

export type HostKind = "marketplace" | "white_label";
export type SessionScope = "account" | "tenant";
export type ScopeRefusal = "unknown_host" | "tenant_token_on_marketplace" | "account_token_on_tenant" | "wrong_tenant" | "malformed_claims";
export type ScopeDecision = { ok: true; scope: SessionScope } | { ok: false; reason: ScopeRefusal };

export type JwtClaims = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * May a session with these verified claims be used for a request to this
 * host? Default deny: an unknown host kind, missing claims or a tenant host
 * with no tenant id all refuse.
 */
export function scopeDecision(host: { kind: string | null | undefined; tenantId: string | null | undefined }, claims: JwtClaims | null | undefined): ScopeDecision {
  if (!claims || typeof claims !== "object") return { ok: false, reason: "malformed_claims" };
  const role = claims.role;
  const hasTenantClaim = Object.prototype.hasOwnProperty.call(claims, TENANT_CLAIM);
  const tenantClaim = claims[TENANT_CLAIM];

  if (host.kind === "marketplace") {
    if (role === TENANT_READER_ROLE || hasTenantClaim) return { ok: false, reason: "tenant_token_on_marketplace" };
    return { ok: true, scope: "account" };
  }
  if (host.kind === "white_label") {
    if (role !== TENANT_READER_ROLE) return { ok: false, reason: "account_token_on_tenant" };
    if (typeof tenantClaim !== "string" || !UUID.test(tenantClaim)) return { ok: false, reason: "malformed_claims" };
    if (!host.tenantId || !UUID.test(host.tenantId)) return { ok: false, reason: "wrong_tenant" };
    if (tenantClaim.toLowerCase() !== host.tenantId.toLowerCase()) return { ok: false, reason: "wrong_tenant" };
    return { ok: true, scope: "tenant" };
  }
  return { ok: false, reason: "unknown_host" };
}

/**
 * The payload of a JWT, or null when it is not one. This reads; it does not
 * verify. Only call it on a token Supabase Auth has just verified or issued.
 */
export function decodeJwtClaims(token: string | null | undefined): JwtClaims | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as JwtClaims;
  } catch {
    return null;
  }
}

/** The session id claim, when it is a uuid. */
export function sessionIdOf(claims: JwtClaims | null): string | null {
  const v = claims?.session_id;
  return typeof v === "string" && UUID.test(v) ? v.toLowerCase() : null;
}

/** True for the session cookie and its chunks (name, name.0, name.1) only, not the PKCE verifier cookies beside it. */
export function isSessionCookieName(name: string, base: string): boolean {
  return name === base || (name.startsWith(`${base}.`) && /^\d+$/.test(name.slice(base.length + 1)));
}
