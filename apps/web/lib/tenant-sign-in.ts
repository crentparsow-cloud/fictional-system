import { decodeJwtClaims, scopeDecision, sessionIdOf } from "@/lib/session-scope";

/**
 * Signing a reader in on a tenant host (F-133): the order of steps that
 * makes the session tenant-scoped before the browser is given anything.
 *
 *   0. (before this) the reader typed Akana's own code for this tenant and
 *      it checked out (lib/tenant-code-server.ts). No Supabase code or link
 *      is ever sent to a reader for a tenant host.
 *   1. establish   the server makes the Supabase session itself, for the
 *                  address that passed the code, on a client that keeps the
 *                  session in memory.
 *   2. register    read the session id from the fresh token and record
 *                  (session, user, tenant, host) with the service role
 *                  (public.register_tenant_session, migration 0073).
 *   3. refresh     ask Supabase Auth for a new token. The access token hook
 *                  now finds the scope row and stamps role tenant_reader and
 *                  akana_tenant.
 *   4. check       the new token must carry that role and this tenant, for
 *                  the same user and session, and Supabase Auth must accept
 *                  it (getUser with the token).
 *   5. commit      the session is sealed into the server-side store and the
 *                  browser gets an opaque id (lib/tenant-session-store.ts).
 *
 * No Supabase token ever reaches the browser, scoped or not. If any step
 * fails (the hook is not enabled, the lookup failed, the flag went off, the
 * store is not configured) the session is signed out and no cookie is
 * written: fail closed. An account with two-step sign-in is refused, because
 * a tenant host cannot ask for the second step.
 *
 * Pure: every effect is a dependency, so the order is tested with fakes
 * (lib/tenant-sign-in.test.ts). lib/tenant-sign-in-server.ts wires Supabase.
 */
export type TenantSignInFailure = "establish" | "session" | "two_step" | "register" | "refresh" | "not_scoped" | "verify" | "store" | "error";
export type TenantSignInResult = { ok: true } | { ok: false; reason: TenantSignInFailure };

export interface EstablishedSession {
  accessToken: string;
  userId: string;
  /** True when the account has a verified second factor. */
  hasVerifiedFactor: boolean;
}

export interface TenantSignInDeps {
  /** The tenant and the verified host, both as the proxy resolved them. */
  tenantId: string;
  host: string;
  establish: () => Promise<EstablishedSession | null>;
  registerScope: (row: { sessionId: string; userId: string; tenantId: string; host: string }) => Promise<boolean>;
  /** The access token of the refreshed session, or null. */
  refresh: () => Promise<string | null>;
  /** The user id Supabase Auth returns for this exact token, or null. */
  verify: (accessToken: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  /** Stores the session held in memory on the server and gives the browser its opaque id. False when it could not. */
  commit: (session: { sessionId: string; userId: string }) => Promise<boolean>;
}

export async function completeTenantSignIn(deps: TenantSignInDeps): Promise<TenantSignInResult> {
  let established = false;
  const fail = async (reason: TenantSignInFailure): Promise<TenantSignInResult> => {
    if (established) {
      try {
        await deps.signOut();
      } catch {
        // The session stays scoped or unusable either way; no cookie holds it.
      }
    }
    return { ok: false, reason };
  };

  try {
    const first = await deps.establish();
    if (!first) return fail("establish");
    established = true;

    const firstClaims = decodeJwtClaims(first.accessToken);
    const sessionId = sessionIdOf(firstClaims);
    if (!sessionId || !firstClaims || firstClaims.sub !== first.userId) return fail("session");
    if (first.hasVerifiedFactor) return fail("two_step");

    if (!(await deps.registerScope({ sessionId, userId: first.userId, tenantId: deps.tenantId, host: deps.host }))) return fail("register");

    const token = await deps.refresh();
    if (!token) return fail("refresh");

    const claims = decodeJwtClaims(token);
    const scoped =
      claims !== null &&
      claims.sub === first.userId &&
      sessionIdOf(claims) === sessionId &&
      scopeDecision({ kind: "white_label", tenantId: deps.tenantId }, claims).ok;
    if (!scoped) return fail("not_scoped");

    if ((await deps.verify(token)) !== first.userId) return fail("verify");

    if (!(await deps.commit({ sessionId, userId: first.userId }))) return fail("store");
    return { ok: true };
  } catch {
    return fail("error");
  }
}

/** The reader-facing error code for a failed sign-in. Plain, and the same for every internal cause but one. */
export function tenantSignInErrorCode(reason: TenantSignInFailure): "twostep" | "unavailable" {
  return reason === "two_step" ? "twostep" : "unavailable";
}
