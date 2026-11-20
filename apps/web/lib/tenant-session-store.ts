import { KeyRing } from "@akana/seal";
import { createClient } from "@supabase/supabase-js";
import { isSessionCookieName } from "@/lib/session-scope";

/**
 * The session store behind the tenant cookie (F-133).
 *
 * A tenant controls the domain its site is served on. So the browser on a
 * tenant host is never given a Supabase token: with one, whoever controls
 * the domain could call Supabase Auth directly and leave the tenant scope
 * (set a password, enrol a factor, sign the account out everywhere). The
 * browser holds one opaque random id in `__Host-akana-tenant-session`. The
 * Supabase session it stands for is kept here, in
 * public.tenant_browser_sessions (migration 0073), sealed with a server key.
 *
 *   - Only the sha256 of the id is stored. A copy of the table opens nothing.
 *   - The sealed blob is bound to the user and the tenant (the seal's AAD),
 *     so a row moved to another tenant or user will not open.
 *   - A row is good for one tenant: it is looked up with the tenant the
 *     proxy resolved, and checked again after it is read. An id from tenant
 *     A is nothing on tenant B, and nothing on the Akana site, which never
 *     reads this cookie at all.
 *   - 30 days from sign-in at most, and 7 days without use (the limits
 *     below). Revoked rows are dead at once.
 *
 * How it plugs in. @supabase/ssr keeps a session in cookies through two
 * functions, getAll and setAll. On a tenant host those are served from this
 * store instead of the browser (tenantCookieAdapter): getAll returns the
 * unsealed session as the cookies ssr expects, setAll seals and stores what
 * ssr would have written, so a token refresh is captured. The proxy and
 * createUserClient both use it.
 *
 * Concurrent refresh. Two requests may refresh the same session at once.
 * Each write is a compare-and-swap on the row's version. The loser re-reads
 * and keeps what the winner stored; it never overwrites a newer session with
 * an older one. Supabase accepts the losing refresh token for a short
 * interval, so both requests complete.
 *
 * Config. TENANT_SESSION_KEYS, a key ring in the same format as
 * ANSWERS_KEYS. Blank or malformed means there is no store and tenant
 * sign-in is unavailable: fail closed. The service role key is used here and
 * only on the server; this file has no "server-only" import because the
 * proxy loads it, and it must never be imported from a client component.
 */
export const TENANT_SESSION_COOKIE = "__Host-akana-tenant-session";
export const TENANT_SESSION_LIMITS = {
  /** Days from sign-in after which the session ends, whatever its use. */
  absoluteDays: 30,
  /** Days without use after which it ends. */
  idleDays: 7,
  /** last_seen_at is written at most this often, in minutes. */
  touchMinutes: 5,
} as const;
export const TENANT_SESSION_COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: TENANT_SESSION_LIMITS.absoluteDays * 86400 } as const;

/** The name @supabase/ssr stores its session under. Lives here so the proxy and the server agree. */
export const SUPABASE_AUTH_COOKIE = "__Host-akana-auth";

const OPAQUE = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DAY_MS = 86_400_000;

/** One stored row, as the database holds it. */
export interface StoredRow {
  id_hash: string;
  tenant_id: string;
  user_id: string;
  session_id: string;
  sealed: string;
  version: number;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
}

/** The four things the store asks of the database. Faked in tests. */
export interface StoreDb {
  insert(row: Omit<StoredRow, "version" | "last_seen_at" | "revoked_at">): Promise<boolean>;
  /** The row for this id hash and tenant, or null. */
  find(idHash: string, tenantId: string): Promise<StoredRow | null>;
  /** Writes `sealed` only if the row still has `version` and is not revoked. True when it did. */
  swap(idHash: string, version: number, sealed: string, nowIso: string): Promise<boolean>;
  touch(idHash: string, nowIso: string): Promise<void>;
  revoke(idHash: string, nowIso: string): Promise<void>;
}

export interface Sealer {
  seal(value: unknown, scope: { userId: string; tenantId: string }): Promise<string>;
  unseal(sealed: string, scope: { userId: string; tenantId: string }): Promise<unknown>;
}

const FIELD = "tenant-session";

/** The sealer from TENANT_SESSION_KEYS, or null when it is blank or malformed. */
export function tenantSessionSealer(env: Record<string, string | undefined> = process.env): Sealer | null {
  const keys = (env.TENANT_SESSION_KEYS ?? "").trim();
  if (!keys) return null;
  let ring: KeyRing;
  try {
    ring = KeyRing.fromEnv({ ANSWERS_KEYS: keys });
  } catch {
    console.error("tenant_session_keys_invalid");
    return null;
  }
  return {
    seal: async (value, scope) => (await ring.seal(value, { ...scope, field: FIELD })).value,
    unseal: (sealed, scope) => ring.unseal(sealed, { ...scope, field: FIELD }),
  };
}

/** The database half, over the service role. Null when it is not configured. */
export function tenantSessionDb(env: Record<string, string | undefined> = process.env): StoreDb | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const table = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).from("tenant_browser_sessions");
  const COLUMNS = "id_hash, tenant_id, user_id, session_id, sealed, version, last_seen_at, expires_at, revoked_at";
  return {
    async insert(row) {
      const { error } = await table().insert(row);
      if (error) console.error("tenant_session_insert_failed", error.code ?? "");
      return !error;
    },
    async find(idHash, tenantId) {
      const { data, error } = await table().select(COLUMNS).eq("id_hash", idHash).eq("tenant_id", tenantId).maybeSingle();
      if (error) {
        console.error("tenant_session_find_failed", error.code ?? "");
        return null;
      }
      return (data as StoredRow | null) ?? null;
    },
    async swap(idHash, version, sealed, nowIso) {
      const { data, error } = await table()
        .update({ sealed, version: version + 1, last_seen_at: nowIso })
        .eq("id_hash", idHash)
        .eq("version", version)
        .is("revoked_at", null)
        .select("version");
      if (error) console.error("tenant_session_swap_failed", error.code ?? "");
      return !error && Array.isArray(data) && data.length === 1;
    },
    async touch(idHash, nowIso) {
      await table().update({ last_seen_at: nowIso }).eq("id_hash", idHash).is("revoked_at", null);
    },
    async revoke(idHash, nowIso) {
      const { error } = await table().update({ revoked_at: nowIso }).eq("id_hash", idHash).is("revoked_at", null);
      if (error) console.error("tenant_session_revoke_failed", error.code ?? "");
    },
  };
}

export interface TenantStore {
  db: StoreDb;
  sealer: Sealer;
}

/** The store, or null when either half is missing. Callers treat null as "nobody is signed in". */
export function tenantStoreFromEnv(env: Record<string, string | undefined> = process.env): TenantStore | null {
  const sealer = tenantSessionSealer(env);
  const db = tenantSessionDb(env);
  return sealer && db ? { db, sealer } : null;
}

/** A new opaque id: 32 random bytes, base64url. */
export function newOpaqueId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

export async function hashOpaqueId(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(digest).toString("hex");
}

/** The cookies @supabase/ssr would have written, by name. Only the session cookie and its chunks are kept. */
export type SessionCookies = Record<string, string>;

function onlySessionCookies(input: Record<string, string>): SessionCookies {
  const out: SessionCookies = {};
  for (const [name, value] of Object.entries(input)) {
    if (isSessionCookieName(name, SUPABASE_AUTH_COOKIE) && typeof value === "string" && value !== "") out[name] = value;
  }
  return out;
}

/** Stores a new session and returns the opaque id for the browser, or null when it could not be stored. */
export async function createTenantSession(
  store: TenantStore,
  input: { tenantId: string; userId: string; sessionId: string; cookies: Record<string, string> },
  now: Date = new Date(),
): Promise<string | null> {
  const cookies = onlySessionCookies(input.cookies);
  if (!UUID.test(input.tenantId) || !UUID.test(input.userId) || !UUID.test(input.sessionId) || Object.keys(cookies).length === 0) return null;
  const opaque = newOpaqueId();
  const sealed = await store.sealer.seal(cookies, { userId: input.userId, tenantId: input.tenantId });
  const ok = await store.db.insert({
    id_hash: await hashOpaqueId(opaque),
    tenant_id: input.tenantId,
    user_id: input.userId,
    session_id: input.sessionId,
    sealed,
    expires_at: new Date(now.getTime() + TENANT_SESSION_LIMITS.absoluteDays * DAY_MS).toISOString(),
  });
  return ok ? opaque : null;
}

export interface LoadedTenantSession {
  idHash: string;
  tenantId: string;
  userId: string;
  sessionId: string;
  version: number;
  cookies: SessionCookies;
}

/**
 * The session an opaque id stands for on this tenant, or null. Null for a
 * malformed id, an unknown id, an id of another tenant, a revoked, expired
 * or idle row, and a blob that will not open for this user and tenant.
 */
export async function loadTenantSession(store: TenantStore, opaque: string | null | undefined, tenantId: string | null | undefined, now: Date = new Date()): Promise<LoadedTenantSession | null> {
  if (typeof opaque !== "string" || !OPAQUE.test(opaque)) return null;
  if (typeof tenantId !== "string" || !UUID.test(tenantId)) return null;
  const idHash = await hashOpaqueId(opaque);
  const row = await store.db.find(idHash, tenantId);
  if (!row) return null;
  // The query already asked for this tenant. Checked again on what came back.
  if (row.id_hash !== idHash || row.tenant_id !== tenantId) return null;
  if (row.revoked_at !== null) return null;
  const t = now.getTime();
  const expires = Date.parse(row.expires_at);
  const seen = Date.parse(row.last_seen_at);
  if (!Number.isFinite(expires) || expires <= t) return null;
  if (!Number.isFinite(seen) || seen + TENANT_SESSION_LIMITS.idleDays * DAY_MS <= t) return null;
  let cookies: SessionCookies;
  try {
    const opened = await store.sealer.unseal(row.sealed, { userId: row.user_id, tenantId: row.tenant_id });
    if (!opened || typeof opened !== "object" || Array.isArray(opened)) return null;
    cookies = onlySessionCookies(opened as Record<string, string>);
  } catch {
    return null;
  }
  if (Object.keys(cookies).length === 0) return null;
  if (seen + TENANT_SESSION_LIMITS.touchMinutes * 60_000 <= t) {
    try {
      await store.db.touch(idHash, now.toISOString());
    } catch {
      // A missed touch only brings the idle limit forward.
    }
  }
  return { idHash, tenantId: row.tenant_id, userId: row.user_id, sessionId: row.session_id, version: row.version, cookies };
}

export async function revokeTenantSession(store: TenantStore, idHash: string, now: Date = new Date()): Promise<void> {
  await store.db.revoke(idHash, now.toISOString());
}

/**
 * getAll and setAll for @supabase/ssr, served from the store. `loaded` is
 * the session read at the start of the request; null means nobody is signed
 * in, and then nothing is returned and nothing is ever written.
 */
export function tenantCookieAdapter(store: TenantStore | null, loaded: LoadedTenantSession | null, now: () => Date = () => new Date()) {
  let current = loaded ? { ...loaded, cookies: { ...loaded.cookies } } : null;
  let ended = false;
  return {
    getAll: (): { name: string; value: string }[] => (current && !ended ? Object.entries(current.cookies).map(([name, value]) => ({ name, value })) : []),
    setAll: async (list: { name: string; value: string }[]): Promise<void> => {
      if (!store || !current || ended) return;
      const next: Record<string, string> = { ...current.cookies };
      for (const { name, value } of list) {
        if (!isSessionCookieName(name, SUPABASE_AUTH_COOKIE)) continue;
        if (value === "") delete next[name];
        else next[name] = value;
      }
      // Signed out: ssr removed every part of the session.
      if (Object.keys(next).length === 0) {
        ended = true;
        await store.db.revoke(current.idHash, now().toISOString());
        return;
      }
      if (JSON.stringify(next) === JSON.stringify(current.cookies)) return;
      const sealed = await store.sealer.seal(next, { userId: current.userId, tenantId: current.tenantId });
      if (await store.db.swap(current.idHash, current.version, sealed, now().toISOString())) {
        current = { ...current, version: current.version + 1, cookies: next };
        return;
      }
      // Another request stored a newer session first, or the row was revoked.
      // Keep what is in the database; never write over it.
      const row = await store.db.find(current.idHash, current.tenantId);
      if (!row || row.revoked_at !== null) {
        ended = true;
        return;
      }
      current = { ...current, version: row.version };
    },
    /** True once the session was signed out or found revoked during this request. */
    ended: () => ended,
    idHash: () => current?.idHash ?? null,
  };
}
