import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Supabase wiring of the tenant-host sign-in, with Supabase mocked and
 * the real store over an in-memory table. What it proves: the server makes
 * the session itself, the scope is registered before anything is stored,
 * the browser gets an opaque id and never a Supabase token, and a failure
 * signs the session out and gives the browser nothing.
 */
vi.mock("server-only", () => ({}));

const A = "a7300000-0000-0000-0000-0000000000b1";
const SID = "a7300000-0000-0000-0000-000000005e01";
const USER = "a7300000-0000-0000-0000-000000000001";
const COOKIE = "__Host-akana-auth";
const TENANT_COOKIE = "__Host-akana-tenant-session";
const KEYS = `v2.k1.${Buffer.alloc(32, 5).toString("base64")}`;

function jwt(payload: unknown): string {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${enc({ alg: "HS256" })}.${enc(payload)}.sig`;
}
const first = jwt({ sub: USER, role: "authenticated", session_id: SID });
const scoped = jwt({ sub: USER, role: "tenant_reader", akana_tenant: A, session_id: SID });

type Row = { id_hash: string; tenant_id: string; user_id: string; session_id: string; sealed: string; expires_at: string };
const world = {
  headers: {} as Record<string, string>,
  browser: [] as { name: string; value: string }[],
  written: [] as { name: string; value: string; options: Record<string, unknown> }[],
  log: [] as string[],
  seenByClient: [] as string[],
  rows: [] as Row[],
  hook: true,
  registerError: null as { code: string } | null,
  userExists: true,
  linkType: "magiclink",
  sessionEmail: "reader@example.com",
  factors: [] as { status: string }[],
  rpcArgs: null as unknown,
  linkArgs: [] as unknown[],
  verifyArgs: null as unknown,
  createArgs: null as unknown,
  insertOk: true,
};

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => world.headers[k] ?? null }),
  cookies: async () => ({
    getAll: () => world.browser,
    get: (n: string) => world.browser.find((c) => c.name === n),
    set: (name: string, value: string, options: Record<string, unknown>) => {
      world.log.push(`cookie:${name}`);
      world.written.push({ name, value, options });
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: unknown) => {
      world.log.push(`rpc:${fn}`);
      world.rpcArgs = args;
      return world.registerError ? { data: null, error: world.registerError } : { data: true, error: null };
    },
    auth: {
      admin: {
        generateLink: async (args: unknown) => {
          world.log.push("generateLink");
          world.linkArgs.push(args);
          if (!world.userExists) return { data: { properties: null, user: null }, error: { status: 404, name: "AuthApiError" } };
          return { data: { properties: { hashed_token: "hashed-token", verification_type: world.linkType, action_link: "https://db.example/auth/v1/verify?token=hashed-token", email_otp: "999999" }, user: { id: USER } }, error: null };
        },
        createUser: async (args: unknown) => {
          world.log.push("createUser");
          world.createArgs = args;
          world.userExists = true;
          return { data: { user: { id: USER } }, error: null };
        },
      },
    },
  }),
}));

// The store's database half: an in-memory table behind the same supabase-js calls.
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      insert: async (row: Row) => {
        world.log.push("store:insert");
        if (!world.insertOk) return { error: { code: "XX000" } };
        world.rows.push(row);
        return { error: null };
      },
    }),
  }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_u: string, _k: string, opts: { cookies: { getAll: () => { name: string }[]; setAll: (l: { name: string; value: string; options: object }[]) => void } }) => {
    world.seenByClient = opts.cookies.getAll().map((c) => c.name);
    const save = (token: string) => opts.cookies.setAll([{ name: `${COOKIE}.0`, value: token, options: { path: "/" } }]);
    return {
      auth: {
        verifyOtp: async (args: unknown) => {
          world.log.push("verifyOtp");
          world.verifyArgs = args;
          save(first);
          return { data: { session: { access_token: first }, user: { id: USER, email: world.sessionEmail, factors: world.factors } }, error: null };
        },
        refreshSession: async () => {
          world.log.push("refresh");
          const token = world.hook ? scoped : first;
          save(token);
          return { data: { session: { access_token: token } }, error: null };
        },
        getUser: async () => {
          world.log.push("getUser");
          return { data: { user: { id: USER } } };
        },
        signOut: async () => {
          world.log.push("signOut");
          opts.cookies.setAll([{ name: `${COOKIE}.0`, value: "", options: { maxAge: 0 } }]);
          return { error: null };
        },
      },
    };
  },
}));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "pk");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "svc");
  vi.stubEnv("TENANT_SESSION_KEYS", KEYS);
  world.headers = { "x-akana-tenant-kind": "white_label", "x-akana-tenant-id": A, "x-akana-tenant-host": "books.a.example", "x-akana-tenant-sign-in": "1" };
  world.browser = [{ name: `${COOKIE}.0`, value: "an-old-supabase-session" }];
  world.written = [];
  world.log = [];
  world.rows = [];
  world.hook = true;
  world.registerError = null;
  world.userExists = true;
  world.linkType = "magiclink";
  world.sessionEmail = "reader@example.com";
  world.factors = [];
  world.rpcArgs = null;
  world.linkArgs = [];
  world.verifyArgs = null;
  world.createArgs = null;
  world.insertOk = true;
});

describe("signInOnTenantHost (F-133)", () => {
  it("makes the session on the server, scopes it, stores it sealed, and gives the browser only an opaque id", async () => {
    const { signInOnTenantHost } = await import("./tenant-sign-in-server");
    expect(await signInOnTenantHost("reader@example.com")).toEqual({ ok: true });
    expect(world.log).toEqual(["generateLink", "verifyOtp", "rpc:register_tenant_session", "refresh", "getUser", "store:insert", `cookie:${TENANT_COOKIE}`]);
    // The one-time token is made and spent on the server: no email, no link to the reader.
    expect(world.linkArgs).toEqual([{ type: "magiclink", email: "reader@example.com" }]);
    expect(world.verifyArgs).toEqual({ token_hash: "hashed-token", type: "magiclink" });
    // The tenant and the host come from the proxy's headers.
    expect(world.rpcArgs).toEqual({ p_session: SID, p_user: USER, p_tenant: A, p_host: "books.a.example" });

    // The browser: one cookie, opaque, with the locked attributes. No Supabase cookie, no token.
    expect(world.written.length).toBe(1);
    const cookie = world.written[0]!;
    expect(cookie.name).toBe(TENANT_COOKIE);
    expect(cookie.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookie.options).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(cookie.options).not.toHaveProperty("domain");
    for (const token of [first, scoped]) expect(JSON.stringify(world.written)).not.toContain(token);

    // The store: the hash of the id, the tenant, and a sealed blob that holds the scoped token only.
    expect(world.rows.length).toBe(1);
    const row = world.rows[0]!;
    expect(row).toMatchObject({ tenant_id: A, user_id: USER, session_id: SID });
    expect(row.id_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(cookie.value);
    expect(row.sealed).not.toContain(scoped);
    const { tenantSessionSealer } = await import("./tenant-session-store");
    expect(await tenantSessionSealer()!.unseal(row.sealed, { userId: USER, tenantId: A })).toEqual({ [`${COOKIE}.0`]: scoped });

    // A Supabase session cookie already in the browser is never handed to the client.
    expect(world.seenByClient).toEqual([]);
  });

  it("a new address: the account is made only now, confirmed, and then signed in the same way", async () => {
    const { signInOnTenantHost } = await import("./tenant-sign-in-server");
    world.userExists = false;
    world.sessionEmail = "new@example.com";
    expect(await signInOnTenantHost("new@example.com")).toEqual({ ok: true });
    expect(world.log.slice(0, 4)).toEqual(["generateLink", "createUser", "generateLink", "verifyOtp"]);
    expect(world.createArgs).toEqual({ email: "new@example.com", email_confirm: true });
    expect(world.written.map((c) => c.name)).toEqual([TENANT_COOKIE]);
  });

  it("uses the verification type Supabase names for the token", async () => {
    const { signInOnTenantHost } = await import("./tenant-sign-in-server");
    world.linkType = "signup";
    expect(await signInOnTenantHost("reader@example.com")).toEqual({ ok: true });
    expect(world.verifyArgs).toEqual({ token_hash: "hashed-token", type: "signup" });
  });

  it("a session that comes back for another address is refused before anything is registered", async () => {
    const { signInOnTenantHost } = await import("./tenant-sign-in-server");
    world.sessionEmail = "someone-else@example.com";
    expect(await signInOnTenantHost("reader@example.com")).toEqual({ ok: false, reason: "establish" });
    expect(world.log).not.toContain("rpc:register_tenant_session");
    expect(world.written).toEqual([]);
    expect(world.rows).toEqual([]);
  });

  it("hook not enabled: signs out, stores nothing, and the browser gets nothing", async () => {
    const { signInOnTenantHost } = await import("./tenant-sign-in-server");
    world.hook = false;
    expect(await signInOnTenantHost("reader@example.com")).toEqual({ ok: false, reason: "not_scoped" });
    expect(world.log).toEqual(["generateLink", "verifyOtp", "rpc:register_tenant_session", "refresh", "signOut"]);
    expect(world.written).toEqual([]);
    expect(world.rows).toEqual([]);
  });

  it("scope not registered, or an account with two-step sign-in: signs out, nothing stored, no cookie", async () => {
    const { signInOnTenantHost } = await import("./tenant-sign-in-server");
    world.registerError = { code: "AKS02" };
    expect(await signInOnTenantHost("reader@example.com")).toEqual({ ok: false, reason: "register" });
    expect(world.log).toEqual(["generateLink", "verifyOtp", "rpc:register_tenant_session", "signOut"]);
    world.registerError = null;
    world.log = [];
    world.factors = [{ status: "verified" }];
    expect(await signInOnTenantHost("reader@example.com")).toEqual({ ok: false, reason: "two_step" });
    expect(world.log).toEqual(["generateLink", "verifyOtp", "signOut"]);
    expect(world.written).toEqual([]);
    expect(world.rows).toEqual([]);
  });

  it("the store cannot keep the session: signs out and sets no cookie", async () => {
    const { signInOnTenantHost } = await import("./tenant-sign-in-server");
    world.insertOk = false;
    expect(await signInOnTenantHost("reader@example.com")).toEqual({ ok: false, reason: "store" });
    expect(world.log.at(-1)).toBe("signOut");
    expect(world.written).toEqual([]);
  });

  it("with TENANT_SESSION_KEYS blank nothing is tried at all: fail closed", async () => {
    const { signInOnTenantHost } = await import("./tenant-sign-in-server");
    vi.stubEnv("TENANT_SESSION_KEYS", "");
    expect(await signInOnTenantHost("reader@example.com")).toEqual({ ok: false, reason: "store" });
    expect(world.log).toEqual([]);
    expect(world.written).toEqual([]);
  });

  it("does nothing when sign-in is off for the tenant, or off a tenant host", async () => {
    const { signInOnTenantHost } = await import("./tenant-sign-in-server");
    delete world.headers["x-akana-tenant-sign-in"];
    expect((await signInOnTenantHost("reader@example.com")).ok).toBe(false);
    world.headers = { "x-akana-tenant-kind": "marketplace", "x-akana-tenant-id": "00000000-0000-0000-0000-00000000000a", "x-akana-tenant-sign-in": "1" };
    expect((await signInOnTenantHost("reader@example.com")).ok).toBe(false);
    expect(world.log).toEqual([]);
    expect(world.written).toEqual([]);
  });
});
