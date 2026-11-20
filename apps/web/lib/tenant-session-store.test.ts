import { describe, expect, it } from "vitest";
import {
  createTenantSession,
  hashOpaqueId,
  loadTenantSession,
  newOpaqueId,
  revokeTenantSession,
  tenantCookieAdapter,
  tenantSessionSealer,
  tenantStoreFromEnv,
  TENANT_SESSION_LIMITS,
  type StoreDb,
  type StoredRow,
  type TenantStore,
} from "./tenant-session-store";

const A = "a7300000-0000-0000-0000-0000000000b1";
const B = "a7300000-0000-0000-0000-0000000000b2";
const USER = "a7300000-0000-0000-0000-000000000001";
const SID = "a7300000-0000-0000-0000-000000005e01";
const COOKIE = "__Host-akana-auth";
const KEYS = `v2.k1.${Buffer.alloc(32, 7).toString("base64")}`;
const DAY = 86_400_000;

/** The database half, in memory, with the same rules as the real one. */
function memoryDb() {
  const rows = new Map<string, StoredRow>();
  const calls: string[] = [];
  const db: StoreDb = {
    async insert(row) {
      calls.push("insert");
      if (rows.has(row.id_hash)) return false;
      rows.set(row.id_hash, { ...row, version: 1, last_seen_at: new Date(Date.parse(row.expires_at) - TENANT_SESSION_LIMITS.absoluteDays * DAY).toISOString(), revoked_at: null });
      return true;
    },
    async find(idHash, tenantId) {
      calls.push("find");
      const r = rows.get(idHash);
      return r && r.tenant_id === tenantId ? { ...r } : null;
    },
    async swap(idHash, version, sealed, nowIso) {
      calls.push("swap");
      const r = rows.get(idHash);
      if (!r || r.version !== version || r.revoked_at) return false;
      rows.set(idHash, { ...r, sealed, version: version + 1, last_seen_at: nowIso });
      return true;
    },
    async touch(idHash, nowIso) {
      calls.push("touch");
      const r = rows.get(idHash);
      if (r && !r.revoked_at) rows.set(idHash, { ...r, last_seen_at: nowIso });
    },
    async revoke(idHash, nowIso) {
      calls.push("revoke");
      const r = rows.get(idHash);
      if (r && !r.revoked_at) rows.set(idHash, { ...r, revoked_at: nowIso });
    },
  };
  return { db, rows, calls };
}

function store(): { store: TenantStore; rows: Map<string, StoredRow>; calls: string[] } {
  const m = memoryDb();
  return { store: { db: m.db, sealer: tenantSessionSealer({ TENANT_SESSION_KEYS: KEYS })! }, rows: m.rows, calls: m.calls };
}

const T0 = new Date("2026-11-20T12:00:00Z");
const at = (days: number) => new Date(T0.getTime() + days * DAY);
const session = { tenantId: A, userId: USER, sessionId: SID, cookies: { [`${COOKIE}.0`]: "part-0", [`${COOKIE}.1`]: "part-1" } };

describe("tenant session store (F-133)", () => {
  it("gives the browser an opaque id and keeps only its hash and a sealed blob", async () => {
    const s = store();
    const opaque = await createTenantSession(s.store, session, T0);
    expect(opaque).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [row] = [...s.rows.values()];
    expect(row!.id_hash).toBe(await hashOpaqueId(opaque!));
    expect(row!.id_hash).not.toContain(opaque!);
    expect(row!.sealed.startsWith("v2.k1.")).toBe(true);
    expect(row!.sealed).not.toContain("part-0");
    expect(JSON.stringify(row)).not.toContain(opaque!);
    expect(Date.parse(row!.expires_at) - T0.getTime()).toBe(30 * DAY);
    expect(newOpaqueId()).not.toBe(newOpaqueId());
    expect(await loadTenantSession(s.store, opaque, A, T0)).toMatchObject({ userId: USER, sessionId: SID, tenantId: A, version: 1, cookies: session.cookies });
  });

  it("an id from tenant A is nothing on tenant B, and nothing with no tenant", async () => {
    const s = store();
    const opaque = await createTenantSession(s.store, session, T0);
    expect(await loadTenantSession(s.store, opaque, B, T0)).toBeNull();
    expect(await loadTenantSession(s.store, opaque, null, T0)).toBeNull();
    expect(await loadTenantSession(s.store, opaque, "demo", T0)).toBeNull();
    expect(await loadTenantSession(s.store, opaque, "00000000-0000-0000-0000-00000000000a", T0)).toBeNull();
    // Even if the database handed back another tenant's row, it is refused.
    const leaky: TenantStore = { ...s.store, db: { ...s.store.db, find: async (h) => s.rows.get(h) ?? null } };
    expect(await loadTenantSession(leaky, opaque, B, T0)).toBeNull();
  });

  it("a row moved to another tenant or user will not open", async () => {
    const s = store();
    const opaque = await createTenantSession(s.store, session, T0);
    const hash = await hashOpaqueId(opaque!);
    s.rows.set(hash, { ...s.rows.get(hash)!, tenant_id: B });
    expect(await loadTenantSession(s.store, opaque, B, T0)).toBeNull();
    s.rows.set(hash, { ...s.rows.get(hash)!, tenant_id: A, user_id: "a7300000-0000-0000-0000-000000000002" });
    expect(await loadTenantSession(s.store, opaque, A, T0)).toBeNull();
    s.rows.set(hash, { ...s.rows.get(hash)!, user_id: USER, sealed: "v2.k1.AAAA" });
    expect(await loadTenantSession(s.store, opaque, A, T0)).toBeNull();
  });

  it("ends after 30 days whatever its use, and after 7 days without use", async () => {
    const s = store();
    const opaque = await createTenantSession(s.store, session, T0);
    // Used every 6 days: alive until day 30.
    for (const d of [6, 12, 18, 24, 29.9]) expect(await loadTenantSession(s.store, opaque, A, at(d)), `day ${d}`).not.toBeNull();
    expect(await loadTenantSession(s.store, opaque, A, at(30))).toBeNull();
    expect(await loadTenantSession(s.store, opaque, A, at(31))).toBeNull();

    const idle = store();
    const o2 = await createTenantSession(idle.store, session, T0);
    expect(await loadTenantSession(idle.store, o2, A, at(6.9))).not.toBeNull();
    expect(await loadTenantSession(idle.store, o2, A, at(6.9 + 7))).toBeNull();
  });

  it("writes last_seen_at at most every few minutes", async () => {
    const s = store();
    const opaque = await createTenantSession(s.store, session, T0);
    await loadTenantSession(s.store, opaque, A, new Date(T0.getTime() + 60_000));
    expect(s.calls.filter((c) => c === "touch").length).toBe(0);
    await loadTenantSession(s.store, opaque, A, new Date(T0.getTime() + 6 * 60_000));
    expect(s.calls.filter((c) => c === "touch").length).toBe(1);
  });

  it("a revoked id is dead at once", async () => {
    const s = store();
    const opaque = await createTenantSession(s.store, session, T0);
    await revokeTenantSession(s.store, await hashOpaqueId(opaque!), T0);
    expect(await loadTenantSession(s.store, opaque, A, T0)).toBeNull();
  });

  it("refuses malformed ids without asking the database, and refuses to store nonsense", async () => {
    const s = store();
    for (const bad of [null, undefined, "", "short", "a".repeat(44), `${"a".repeat(42)}!`, `${"a".repeat(43)}\n`]) expect(await loadTenantSession(s.store, bad, A, T0)).toBeNull();
    expect(s.calls).toEqual([]);
    expect(await createTenantSession(s.store, { ...session, cookies: {} }, T0)).toBeNull();
    expect(await createTenantSession(s.store, { ...session, cookies: { other: "x", [`${COOKIE}-code-verifier`]: "v" } }, T0)).toBeNull();
    expect(await createTenantSession(s.store, { ...session, tenantId: "demo" }, T0)).toBeNull();
    expect(s.rows.size).toBe(0);
  });

  it("there is no store without keys, with malformed keys, or without the service role", () => {
    const env = { NEXT_PUBLIC_SUPABASE_URL: "https://db.example", SUPABASE_SERVICE_ROLE_KEY: "svc" };
    expect(tenantStoreFromEnv({ ...env, TENANT_SESSION_KEYS: "" })).toBeNull();
    expect(tenantStoreFromEnv({ ...env, TENANT_SESSION_KEYS: "   " })).toBeNull();
    expect(tenantStoreFromEnv({ ...env, TENANT_SESSION_KEYS: "not-a-key" })).toBeNull();
    expect(tenantStoreFromEnv({ TENANT_SESSION_KEYS: KEYS })).toBeNull();
    expect(tenantStoreFromEnv({ ...env, TENANT_SESSION_KEYS: KEYS })).not.toBeNull();
    expect(tenantSessionSealer({})).toBeNull();
  });
});

describe("tenantCookieAdapter (F-133)", () => {
  it("serves the stored session to @supabase/ssr and captures a refresh", async () => {
    const s = store();
    const opaque = await createTenantSession(s.store, session, T0);
    const loaded = await loadTenantSession(s.store, opaque, A, T0);
    const adapter = tenantCookieAdapter(s.store, loaded, () => T0);
    expect(adapter.getAll()).toEqual([
      { name: `${COOKIE}.0`, value: "part-0" },
      { name: `${COOKIE}.1`, value: "part-1" },
    ]);
    // A refresh: one chunk now, the second removed, and a cookie that is not the session's.
    await adapter.setAll([
      { name: `${COOKIE}.0`, value: "fresh" },
      { name: `${COOKIE}.1`, value: "" },
      { name: "other", value: "x" },
    ]);
    expect(adapter.getAll()).toEqual([{ name: `${COOKIE}.0`, value: "fresh" }]);
    const again = await loadTenantSession(s.store, opaque, A, T0);
    expect(again).toMatchObject({ version: 2, cookies: { [`${COOKIE}.0`]: "fresh" } });
    // Writing the same thing again stores nothing.
    const swaps = s.calls.filter((c) => c === "swap").length;
    await adapter.setAll([{ name: `${COOKIE}.0`, value: "fresh" }]);
    expect(s.calls.filter((c) => c === "swap").length).toBe(swaps);
  });

  it("two requests refreshing at once: the first write wins and the second never overwrites it", async () => {
    const s = store();
    const opaque = await createTenantSession(s.store, session, T0);
    const one = tenantCookieAdapter(s.store, await loadTenantSession(s.store, opaque, A, T0), () => T0);
    const two = tenantCookieAdapter(s.store, await loadTenantSession(s.store, opaque, A, T0), () => T0);
    await Promise.all([one.setAll([{ name: `${COOKIE}.0`, value: "from-one" }, { name: `${COOKIE}.1`, value: "" }]), two.setAll([{ name: `${COOKIE}.0`, value: "from-two" }, { name: `${COOKIE}.1`, value: "" }])]);
    const stored = await loadTenantSession(s.store, opaque, A, T0);
    expect(stored).not.toBeNull();
    expect(stored!.version).toBe(2);
    expect(["from-one", "from-two"]).toContain(stored!.cookies[`${COOKIE}.0`]);
    // The session is still there for both, and neither is signed out.
    expect(one.ended()).toBe(false);
    expect(two.ended()).toBe(false);
    // The loser can still save a later refresh: it picked up the new version.
    const winner = stored!.cookies[`${COOKIE}.0`];
    const loser = winner === "from-one" ? two : one;
    await loser.setAll([{ name: `${COOKIE}.0`, value: "later" }]);
    expect((await loadTenantSession(s.store, opaque, A, T0))!.cookies[`${COOKIE}.0`]).toBe("later");
    expect((await loadTenantSession(s.store, opaque, A, T0))!.version).toBe(3);
  });

  it("a sign-out through @supabase/ssr revokes the row", async () => {
    const s = store();
    const opaque = await createTenantSession(s.store, session, T0);
    const adapter = tenantCookieAdapter(s.store, await loadTenantSession(s.store, opaque, A, T0), () => T0);
    await adapter.setAll([
      { name: `${COOKIE}.0`, value: "" },
      { name: `${COOKIE}.1`, value: "" },
    ]);
    expect(adapter.ended()).toBe(true);
    expect(adapter.getAll()).toEqual([]);
    expect(await loadTenantSession(s.store, opaque, A, T0)).toBeNull();
  });

  it("a row revoked while a request is in flight is not brought back by that request's refresh", async () => {
    const s = store();
    const opaque = await createTenantSession(s.store, session, T0);
    const adapter = tenantCookieAdapter(s.store, await loadTenantSession(s.store, opaque, A, T0), () => T0);
    await revokeTenantSession(s.store, await hashOpaqueId(opaque!), T0);
    await adapter.setAll([{ name: `${COOKIE}.0`, value: "fresh" }]);
    expect(adapter.ended()).toBe(true);
    expect(await loadTenantSession(s.store, opaque, A, T0)).toBeNull();
    expect([...s.rows.values()][0]!.revoked_at).not.toBeNull();
  });

  it("with nobody signed in it returns nothing and writes nothing", async () => {
    const s = store();
    const adapter = tenantCookieAdapter(s.store, null);
    expect(adapter.getAll()).toEqual([]);
    await adapter.setAll([{ name: `${COOKIE}.0`, value: "smuggled" }]);
    expect(s.rows.size).toBe(0);
    expect(s.calls).toEqual([]);
    const none = tenantCookieAdapter(null, null);
    await none.setAll([{ name: `${COOKIE}.0`, value: "x" }]);
    expect(none.getAll()).toEqual([]);
  });
});
