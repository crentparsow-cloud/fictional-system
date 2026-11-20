import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The proxy's scope check (F-133) with Supabase mocked: which sessions reach
 * the route, and which are removed from the request and cleared in the browser.
 */
const A = "a7300000-0000-0000-0000-0000000000b1";
const B = "a7300000-0000-0000-0000-0000000000b2";
const COOKIE = "__Host-akana-auth";
const TENANT_COOKIE = "__Host-akana-tenant-session";

function jwt(payload: unknown): string {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${enc({ alg: "HS256" })}.${enc(payload)}.sig`;
}

const state: { user: { id: string } | null; token: string | null; refreshTo: string | null; seenCookies: string[]; created: number } = { user: null, token: null, refreshTo: null, seenCookies: [], created: 0 };

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    opts: { cookies: { getAll: () => { name: string; value: string }[]; setAll: (list: { name: string; value: string; options: object }[], headers?: Record<string, string>) => void | Promise<void> } },
  ) => {
    state.created += 1;
    return {
      auth: {
        getUser: async () => {
          // What the client was given to read its session from.
          state.seenCookies = opts.cookies.getAll().map((c) => `${c.name}=${c.value}`);
          // A refresh writes the new session through setAll, as @supabase/ssr does.
          if (state.refreshTo) {
            state.token = state.refreshTo;
            await opts.cookies.setAll([{ name: `${COOKIE}.0`, value: "refreshed", options: { path: "/" } }], { "Cache-Control": "private, no-cache, no-store" });
          }
          return { data: { user: state.user } };
        },
        getSession: async () => ({ data: { session: state.token ? { access_token: state.token } : null } }),
      },
    };
  },
}));

function request(host: string, cookies: Record<string, string>): { req: NextRequest; headers: Headers } {
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  const req = new NextRequest(`https://${host}/read/x`, { headers: { host, ...(cookie ? { cookie } : {}) } });
  return { req, headers: new Headers(req.headers) };
}

const SESSION = { [`${COOKIE}.0`]: "part0", [`${COOKIE}.1`]: "part1", [`${COOKIE}-code-verifier`]: "v", other: "keep" };

function cleared(res: Response): string[] {
  return (res.headers.getSetCookie?.() ?? []).filter((c) => /Max-Age=0/i.test(c)).map((c) => c.split("=")[0] ?? "");
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "pk");
  state.user = { id: "u1" };
  state.token = null;
  state.refreshTo = null;
  state.seenCookies = [];
  state.created = 0;
});
afterEach(() => vi.unstubAllEnvs());

describe("refreshSession scope check (F-133)", () => {
  it("marketplace: an ordinary session passes untouched", async () => {
    const { refreshSession } = await import("./proxy");
    state.token = jwt({ sub: "u1", role: "authenticated" });
    const { req, headers } = request("akana.example", SESSION);
    const before = headers.get("cookie");
    const { response, userId } = await refreshSession(req, headers, { kind: "marketplace", tenantId: null });
    expect(userId).toBe("u1");
    expect(headers.get("cookie")).toBe(before);
    expect(cleared(response)).toEqual([]);
  });

  it("marketplace: with no host argument the behaviour is the marketplace's", async () => {
    const { refreshSession } = await import("./proxy");
    state.token = jwt({ sub: "u1", role: "authenticated" });
    const { req, headers } = request("akana.example", SESSION);
    expect((await refreshSession(req, headers)).userId).toBe("u1");
  });

  it("marketplace: a tenant-scoped session is removed from the request and cleared in the browser", async () => {
    const { refreshSession } = await import("./proxy");
    for (const claims of [
      { sub: "u1", role: "tenant_reader", akana_tenant: A },
      { sub: "u1", role: "tenant_reader" },
      { sub: "u1", role: "authenticated", akana_tenant: A },
    ]) {
      state.token = jwt(claims);
      const { req, headers } = request("akana.example", SESSION);
      const { response, userId } = await refreshSession(req, headers, { kind: "marketplace", tenantId: null });
      expect(userId).toBeNull();
      expect(headers.get("cookie")).toBe(`${COOKIE}-code-verifier=v; other=keep`);
      expect(cleared(response).sort()).toEqual([`${COOKIE}.0`, `${COOKIE}.1`]);
    }
  });

  it("marketplace: a tenant token Supabase will not vouch for is removed all the same", async () => {
    const { refreshSession } = await import("./proxy");
    state.user = null;
    state.token = jwt({ sub: "u1", role: "tenant_reader", akana_tenant: A });
    const { req, headers } = request("akana.example", SESSION);
    const { userId } = await refreshSession(req, headers, { kind: "marketplace", tenantId: null });
    expect(userId).toBeNull();
    expect(headers.get("cookie")).not.toContain(`${COOKIE}.0`);
  });

  it("stripSessionCookies leaves a request with no other cookie with no cookie header", async () => {
    const { stripSessionCookies } = await import("./proxy");
    const { req, headers } = request("books.a.example", { [COOKIE]: "whole", [TENANT_COOKIE]: "x" });
    expect(stripSessionCookies(req, headers)).toEqual([COOKIE]);
    expect(headers.has("cookie")).toBe(false);
    const kept = request("books.a.example", { [COOKIE]: "whole", [TENANT_COOKIE]: "x" });
    stripSessionCookies(kept.req, kept.headers, { keepTenantCookie: true });
    expect(kept.headers.get("cookie")).toBe(`${TENANT_COOKIE}=x`);
  });
});

/**
 * Tenant hosts: the session comes from the server-side store by the opaque
 * id, never from `__Host-akana-auth`.
 */
describe("refreshSession on a tenant host (F-133)", () => {
  const KEYS = `v2.k1.${Buffer.alloc(32, 9).toString("base64")}`;
  const SID = "a7300000-0000-0000-0000-000000005e01";
  const U1 = "a7300000-0000-0000-0000-000000000001";

  async function world() {
    const mod = await import("@/lib/tenant-session-store");
    const rows = new Map<string, import("@/lib/tenant-session-store").StoredRow>();
    const db: import("@/lib/tenant-session-store").StoreDb = {
      insert: async (row) => (rows.set(row.id_hash, { ...row, version: 1, last_seen_at: new Date().toISOString(), revoked_at: null }), true),
      find: async (h, t) => {
        const r = rows.get(h);
        return r && r.tenant_id === t ? { ...r } : null;
      },
      swap: async (h, v, sealed, now) => {
        const r = rows.get(h);
        if (!r || r.version !== v || r.revoked_at) return false;
        rows.set(h, { ...r, sealed, version: v + 1, last_seen_at: now });
        return true;
      },
      touch: async () => undefined,
      revoke: async (h, now) => {
        const r = rows.get(h);
        if (r) rows.set(h, { ...r, revoked_at: now });
      },
    };
    const store = { db, sealer: mod.tenantSessionSealer({ TENANT_SESSION_KEYS: KEYS })! };
    const opaque = (await mod.createTenantSession(store, { tenantId: A, userId: U1, sessionId: SID, cookies: { [`${COOKIE}.0`]: "stored" } }))!;
    return { mod, store, rows, opaque };
  }
  const tenantCleared = (res: Response) => (res.headers.getSetCookie?.() ?? []).some((c) => c.startsWith(`${TENANT_COOKIE}=;`) && /Max-Age=0/i.test(c));

  it("this tenant's scoped session passes; the Supabase cookie in the browser is never used", async () => {
    const { refreshSession } = await import("./proxy");
    const w = await world();
    state.user = { id: U1 };
    state.token = jwt({ sub: U1, role: "tenant_reader", akana_tenant: A });
    const { req, headers } = request("books.a.example", { [TENANT_COOKIE]: w.opaque, [`${COOKIE}.0`]: "from-the-browser", other: "keep" });
    const { response, userId } = await refreshSession(req, headers, { kind: "white_label", tenantId: A }, undefined, { store: w.store });
    expect(userId).toBe(U1);
    // The opaque id goes on to the route; the Supabase cookie does not.
    expect(headers.get("cookie")).toBe(`${TENANT_COOKIE}=${w.opaque}; other=keep`);
    expect(state.seenCookies).toEqual([`${COOKIE}.0=stored`]);
    expect(tenantCleared(response)).toBe(false);
    expect(response.headers.getSetCookie?.() ?? []).toEqual([]);
  });

  it("a refresh is kept in the store and nothing Supabase issued is sent to the browser", async () => {
    const { refreshSession } = await import("./proxy");
    const w = await world();
    state.user = { id: U1 };
    state.refreshTo = jwt({ sub: U1, role: "tenant_reader", akana_tenant: A });
    const { req, headers } = request("books.a.example", { [TENANT_COOKIE]: w.opaque });
    const { response, userId } = await refreshSession(req, headers, { kind: "white_label", tenantId: A }, undefined, { store: w.store });
    expect(userId).toBe(U1);
    expect((await w.mod.loadTenantSession(w.store, w.opaque, A))?.cookies).toEqual({ [`${COOKIE}.0`]: "refreshed" });
    expect(response.headers.getSetCookie?.() ?? []).toEqual([]);
    expect(headers.get("cookie")).toBe(`${TENANT_COOKIE}=${w.opaque}`);
  });

  it("hook off: a refresh that comes back unscoped revokes the stored session and clears the cookie", async () => {
    const { refreshSession } = await import("./proxy");
    const w = await world();
    state.user = { id: U1 };
    state.refreshTo = jwt({ sub: U1, role: "authenticated" });
    const { req, headers } = request("books.a.example", { [TENANT_COOKIE]: w.opaque, other: "keep" });
    const { response, userId } = await refreshSession(req, headers, { kind: "white_label", tenantId: A }, undefined, { store: w.store });
    expect(userId).toBeNull();
    expect(headers.get("cookie")).toBe("other=keep");
    expect(tenantCleared(response)).toBe(true);
    expect([...w.rows.values()][0]!.revoked_at).not.toBeNull();
    expect(await w.mod.loadTenantSession(w.store, w.opaque, A)).toBeNull();
    expect((response.headers.getSetCookie?.() ?? []).some((c) => c.includes("refreshed"))).toBe(false);
  });

  it("another tenant's id, an unknown id and a revoked id are nothing here", async () => {
    const { refreshSession } = await import("./proxy");
    const w = await world();
    state.user = { id: U1 };
    state.token = jwt({ sub: U1, role: "tenant_reader", akana_tenant: A });
    // The id of tenant A presented on tenant B.
    let r = request("books.b.example", { [TENANT_COOKIE]: w.opaque });
    let out = await refreshSession(r.req, r.headers, { kind: "white_label", tenantId: B }, undefined, { store: w.store });
    expect(out.userId).toBeNull();
    expect(r.headers.has("cookie")).toBe(false);
    expect(tenantCleared(out.response)).toBe(true);
    // That did not harm the real session on tenant A.
    expect(await w.mod.loadTenantSession(w.store, w.opaque, A)).not.toBeNull();
    // Unknown.
    r = request("books.a.example", { [TENANT_COOKIE]: w.mod.newOpaqueId() });
    out = await refreshSession(r.req, r.headers, { kind: "white_label", tenantId: A }, undefined, { store: w.store });
    expect(out.userId).toBeNull();
    expect(tenantCleared(out.response)).toBe(true);
    // Revoked.
    await w.mod.revokeTenantSession(w.store, await w.mod.hashOpaqueId(w.opaque));
    r = request("books.a.example", { [TENANT_COOKIE]: w.opaque });
    out = await refreshSession(r.req, r.headers, { kind: "white_label", tenantId: A }, undefined, { store: w.store });
    expect(out.userId).toBeNull();
    expect(r.headers.has("cookie")).toBe(false);
  });

  it("a stored session whose token is for another tenant, another user, or not verified is revoked", async () => {
    const { refreshSession } = await import("./proxy");
    const cases: { user: { id: string } | null; claims: unknown }[] = [
      { user: { id: U1 }, claims: { sub: U1, role: "authenticated" } },
      { user: { id: U1 }, claims: { sub: U1, role: "tenant_reader", akana_tenant: B } },
      { user: { id: U1 }, claims: { sub: "u2", role: "tenant_reader", akana_tenant: A } },
      { user: { id: "a7300000-0000-0000-0000-000000000002" }, claims: { sub: "a7300000-0000-0000-0000-000000000002", role: "tenant_reader", akana_tenant: A } },
      { user: null, claims: { sub: U1, role: "tenant_reader", akana_tenant: A } },
      { user: { id: U1 }, claims: null },
    ];
    for (const c of cases) {
      const w = await world();
      state.user = c.user;
      state.token = c.claims ? jwt(c.claims) : null;
      state.refreshTo = null;
      const { req, headers } = request("books.a.example", { [TENANT_COOKIE]: w.opaque });
      const { response, userId } = await refreshSession(req, headers, { kind: "white_label", tenantId: A }, undefined, { store: w.store });
      expect(userId).toBeNull();
      expect(headers.has("cookie")).toBe(false);
      expect(tenantCleared(response)).toBe(true);
      expect([...w.rows.values()][0]!.revoked_at).not.toBeNull();
    }
  });

  it("an Akana session cookie alone is nobody on a tenant host, and is not passed on", async () => {
    const { refreshSession } = await import("./proxy");
    const w = await world();
    state.user = { id: U1 };
    state.token = jwt({ sub: U1, role: "authenticated" });
    const { req, headers } = request("books.a.example", SESSION);
    const { userId } = await refreshSession(req, headers, { kind: "white_label", tenantId: A }, undefined, { store: w.store });
    expect(userId).toBeNull();
    expect(headers.get("cookie")).toBe(`${COOKIE}-code-verifier=v; other=keep`);
    expect(state.created).toBe(0);
  });

  it("with no store (TENANT_SESSION_KEYS blank) or no Supabase, nobody is signed in", async () => {
    const { refreshSession } = await import("./proxy");
    const w = await world();
    state.user = { id: U1 };
    state.token = jwt({ sub: U1, role: "tenant_reader", akana_tenant: A });
    let r = request("books.a.example", { [TENANT_COOKIE]: w.opaque });
    expect((await refreshSession(r.req, r.headers, { kind: "white_label", tenantId: A }, undefined, { store: null })).userId).toBeNull();
    expect(r.headers.has("cookie")).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    r = request("books.a.example", { [TENANT_COOKIE]: w.opaque });
    expect((await refreshSession(r.req, r.headers, { kind: "white_label", tenantId: A }, undefined, { store: w.store })).userId).toBeNull();
    expect(r.headers.has("cookie")).toBe(false);
  });

  it("the marketplace never reads the tenant cookie", async () => {
    const { refreshSession } = await import("./proxy");
    const w = await world();
    state.user = null;
    state.token = null;
    const { req, headers } = request("akana.example", { [TENANT_COOKIE]: w.opaque });
    const { userId } = await refreshSession(req, headers, { kind: "marketplace", tenantId: null }, undefined, { store: w.store });
    expect(userId).toBeNull();
    // No store lookup, no revocation, nobody signed in: to the marketplace it is just an unknown cookie.
    expect([...w.rows.values()][0]!.revoked_at).toBeNull();
    expect([...w.rows.values()][0]!.version).toBe(1);
  });
});
