import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const A = "a7300000-0000-0000-0000-0000000000b1";
const B = "a7300000-0000-0000-0000-0000000000b2";
const MARKET = "00000000-0000-0000-0000-00000000000a";

function jwt(payload: unknown): string {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${enc({ alg: "HS256" })}.${enc(payload)}.sig`;
}

const req: { headers: Record<string, string>; token: string | null; verifies: boolean; userId: string; seen: (string | undefined)[] } = {
  headers: {},
  token: null,
  verifies: true,
  userId: "u1",
  seen: [],
};

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => req.headers[k] ?? null }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createUserClient: async () => ({
    auth: {
      getSession: async () => ({ data: { session: req.token ? { access_token: req.token } : null } }),
      getUser: async (token?: string) => {
        req.seen.push(token);
        return { data: { user: req.verifies ? { id: req.userId, email: "r@example.com" } : null } };
      },
    },
  }),
}));

const marketplace = { "x-akana-tenant": "akana", "x-akana-tenant-kind": "marketplace", "x-akana-tenant-id": MARKET };
const tenantA = { "x-akana-tenant": "org-a", "x-akana-tenant-kind": "white_label", "x-akana-tenant-id": A };

beforeEach(() => {
  req.headers = {};
  req.token = null;
  req.verifies = true;
  req.userId = "u1";
  req.seen = [];
});

describe("getScopedUser (F-133)", () => {
  it("verifies the exact token whose claims it reads", async () => {
    const { getScopedUser } = await import("./session-scope-server");
    req.headers = marketplace;
    req.token = jwt({ sub: "u1", role: "authenticated" });
    const got = await getScopedUser();
    expect(got?.scope).toBe("account");
    expect(got?.user.id).toBe("u1");
    expect(req.seen).toEqual([req.token]);
  });

  it("marketplace refuses a tenant token; a tenant host refuses an Akana token", async () => {
    const { getScopedUser } = await import("./session-scope-server");
    req.headers = marketplace;
    req.token = jwt({ sub: "u1", role: "tenant_reader", akana_tenant: A });
    expect(await getScopedUser()).toBeNull();
    req.headers = tenantA;
    req.token = jwt({ sub: "u1", role: "authenticated" });
    expect(await getScopedUser()).toBeNull();
  });

  it("a tenant host accepts its own scoped session and no other tenant's", async () => {
    const { getScopedUser } = await import("./session-scope-server");
    req.headers = tenantA;
    req.token = jwt({ sub: "u1", role: "tenant_reader", akana_tenant: A });
    expect(await getScopedUser()).toMatchObject({ scope: "tenant", tenantId: A });
    req.token = jwt({ sub: "u1", role: "tenant_reader", akana_tenant: B });
    expect(await getScopedUser()).toBeNull();
    // The tenant comes from the proxy's headers; with none the session is refused.
    req.headers = { "x-akana-tenant": "org-a", "x-akana-tenant-kind": "white_label" };
    req.token = jwt({ sub: "u1", role: "tenant_reader", akana_tenant: A });
    expect(await getScopedUser()).toBeNull();
  });

  it("is signed out when Supabase does not verify the token, however good its claims look", async () => {
    const { getScopedUser } = await import("./session-scope-server");
    req.verifies = false;
    req.headers = tenantA;
    req.token = jwt({ sub: "u1", role: "tenant_reader", akana_tenant: A });
    expect(await getScopedUser()).toBeNull();
    req.headers = marketplace;
    req.token = jwt({ sub: "u1", role: "authenticated" });
    expect(await getScopedUser()).toBeNull();
  });

  it("is signed out with no session, a token for another user, a token that is not a JWT, and no proxy headers", async () => {
    const { getScopedUser } = await import("./session-scope-server");
    req.headers = marketplace;
    expect(await getScopedUser()).toBeNull();
    expect(req.seen).toEqual([]);
    req.token = jwt({ sub: "u2", role: "authenticated" });
    expect(await getScopedUser()).toBeNull();
    req.token = "not-a-jwt";
    expect(await getScopedUser()).toBeNull();
    req.headers = {};
    req.token = jwt({ sub: "u1", role: "authenticated" });
    expect(await getScopedUser()).toBeNull();
  });
});
