import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * createUserClient reads its session from the browser on the Akana site and
 * from the server-side store on a tenant host (F-133). Neither ever reads
 * the other's cookie.
 */
vi.mock("server-only", () => ({}));

const A = "a7300000-0000-0000-0000-0000000000b1";
const B = "a7300000-0000-0000-0000-0000000000b2";
const USER = "a7300000-0000-0000-0000-000000000001";
const SID = "a7300000-0000-0000-0000-000000005e01";
const COOKIE = "__Host-akana-auth";
const TENANT_COOKIE = "__Host-akana-tenant-session";

const world = {
  headers: {} as Record<string, string>,
  browser: [] as { name: string; value: string }[],
  browserWrites: [] as string[],
  store: null as import("@/lib/tenant-session-store").TenantStore | null,
  finds: 0,
};

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => world.headers[k] ?? null }),
  cookies: async () => ({
    getAll: () => world.browser,
    get: (n: string) => world.browser.find((c) => c.name === n),
    set: (name: string) => world.browserWrites.push(name),
  }),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_u: string, _k: string, opts: { cookies: unknown }) => ({ cookies: opts.cookies }),
}));
vi.mock("@/lib/tenant-session-store", async (orig) => ({
  ...(await orig<typeof import("@/lib/tenant-session-store")>()),
  tenantStoreFromEnv: () => world.store,
}));

type Client = { cookies: { getAll: () => { name: string; value: string }[]; setAll: (l: { name: string; value: string; options?: object }[]) => void | Promise<void> } };

async function seed(): Promise<string> {
  const mod = await import("@/lib/tenant-session-store");
  const rows = new Map<string, import("@/lib/tenant-session-store").StoredRow>();
  world.store = {
    sealer: mod.tenantSessionSealer({ TENANT_SESSION_KEYS: `v2.k1.${Buffer.alloc(32, 8).toString("base64")}` })!,
    db: {
      insert: async (row) => (rows.set(row.id_hash, { ...row, version: 1, last_seen_at: new Date().toISOString(), revoked_at: null }), true),
      find: async (h, t) => {
        world.finds += 1;
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
      revoke: async (h, now) => void rows.set(h, { ...rows.get(h)!, revoked_at: now }),
    },
  };
  return (await mod.createTenantSession(world.store, { tenantId: A, userId: USER, sessionId: SID, cookies: { [`${COOKIE}.0`]: "stored-session" } }))!;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "pk");
  world.headers = {};
  world.browser = [];
  world.browserWrites = [];
  world.store = null;
  world.finds = 0;
});

describe("createUserClient (F-133)", () => {
  it("Akana site: the session is the browser's cookie, as before, and the tenant cookie opens nothing", async () => {
    const { createUserClient } = await import("./server");
    const opaque = await seed();
    world.headers = { "x-akana-tenant-kind": "marketplace", "x-akana-tenant-id": "00000000-0000-0000-0000-00000000000a" };
    world.browser = [
      { name: `${COOKIE}.0`, value: "akana-session" },
      { name: TENANT_COOKIE, value: opaque },
    ];
    const client = (await createUserClient()) as unknown as Client;
    expect(client.cookies.getAll()).toEqual(world.browser);
    expect(client.cookies.getAll().some((c) => c.value === "stored-session")).toBe(false);
    expect(world.finds).toBe(0);
    await client.cookies.setAll([{ name: `${COOKIE}.0`, value: "refreshed", options: {} }]);
    expect(world.browserWrites).toEqual([`${COOKIE}.0`]);
    // No proxy headers at all is the Akana site too.
    world.headers = {};
    expect(((await createUserClient()) as unknown as Client).cookies.getAll()).toEqual(world.browser);
  });

  it("tenant host: the session comes from the store by the opaque id, and a refresh goes back to the store", async () => {
    const { createUserClient } = await import("./server");
    const opaque = await seed();
    world.headers = { "x-akana-tenant-kind": "white_label", "x-akana-tenant-id": A };
    world.browser = [{ name: TENANT_COOKIE, value: opaque }];
    const client = (await createUserClient()) as unknown as Client;
    expect(client.cookies.getAll()).toEqual([{ name: `${COOKIE}.0`, value: "stored-session" }]);
    await client.cookies.setAll([{ name: `${COOKIE}.0`, value: "refreshed", options: {} }]);
    // Nothing is written to the browser; the next request reads the refreshed session.
    expect(world.browserWrites).toEqual([]);
    expect(((await createUserClient()) as unknown as Client).cookies.getAll()).toEqual([{ name: `${COOKIE}.0`, value: "refreshed" }]);
  });

  it("tenant host: a Supabase session cookie in the browser is never accepted", async () => {
    const { createUserClient } = await import("./server");
    await seed();
    world.headers = { "x-akana-tenant-kind": "white_label", "x-akana-tenant-id": A };
    world.browser = [
      { name: COOKIE, value: "a-whole-supabase-session" },
      { name: `${COOKIE}.0`, value: "chunk" },
    ];
    const client = (await createUserClient()) as unknown as Client;
    expect(client.cookies.getAll()).toEqual([]);
    await client.cookies.setAll([{ name: `${COOKIE}.0`, value: "smuggled", options: {} }]);
    expect(world.browserWrites).toEqual([]);
  });

  it("tenant host: an id from tenant A is nothing on tenant B, with a missing tenant, or with no store", async () => {
    const { createUserClient } = await import("./server");
    const opaque = await seed();
    world.browser = [{ name: TENANT_COOKIE, value: opaque }];
    for (const headers of [
      { "x-akana-tenant-kind": "white_label", "x-akana-tenant-id": B },
      { "x-akana-tenant-kind": "white_label" },
      { "x-akana-tenant-kind": "white_label", "x-akana-tenant-id": "demo" },
    ]) {
      world.headers = headers as Record<string, string>;
      expect(((await createUserClient()) as unknown as Client).cookies.getAll()).toEqual([]);
    }
    world.headers = { "x-akana-tenant-kind": "white_label", "x-akana-tenant-id": A };
    world.store = null;
    expect(((await createUserClient()) as unknown as Client).cookies.getAll()).toEqual([]);
  });
});
