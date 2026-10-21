import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * POST /api/membership/share over fakes: the server makes the token, only its
 * hash reaches the database, and the link goes back to the buyer. Nothing is
 * sent to the invitee.
 */

const TENANT = "00000000-0000-0000-0000-00000000000a";

const fake = {
  signedIn: true,
  rpcs: [] as { name: string; args: Record<string, unknown> }[],
  error: null as { code: string } | null,
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getReaderSession: async () => (fake.signedIn ? { userId: "user-1", email: "buyer@test" } : null) }));
vi.mock("@/lib/tenant-id", () => ({ tenantIdForRequest: async () => TENANT }));
vi.mock("@/lib/supabase/server", () => ({
  createUserClient: async () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      fake.rpcs.push({ name, args });
      return { data: "00000000-0000-0000-0000-0000000000ee", error: fake.error };
    },
  }),
}));

const { POST } = await import("@/app/api/membership/share/route");
const { hashInviteToken } = await import("@/lib/shared-membership-token");

const call = () => POST(new NextRequest("https://akana.test/api/membership/share", { method: "POST", headers: { host: "akana.test" } }));

describe("POST /api/membership/share", () => {
  beforeEach(() => {
    fake.signedIn = true;
    fake.rpcs = [];
    fake.error = null;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("needs a signed-in buyer", async () => {
    fake.signedIn = false;
    expect((await call()).status).toBe(401);
    expect(fake.rpcs).toEqual([]);
  });

  it("returns a link whose token hashes to what the database was given, and stores no raw token", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; text: string };
    const token = body.url.replace("https://akana.test/share/", "");
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(fake.rpcs).toHaveLength(1);
    expect(fake.rpcs[0]).toEqual({ name: "seat_create_invite", args: { p_token_hash: hashInviteToken(token), p_tenant: TENANT } });
    expect(JSON.stringify(fake.rpcs)).not.toContain(token);
    expect(body.text).not.toMatch(/—|–/);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("makes a new token every time", async () => {
    const a = ((await (await call()).json()) as { url: string }).url;
    const b = ((await (await call()).json()) as { url: string }).url;
    expect(a).not.toBe(b);
  });

  it("explains each refusal in plain words", async () => {
    for (const [code, status, pattern] of [
      ["AKS02", 409, /membership for two people/],
      ["AKS03", 409, /ending/],
      ["AKS04", 409, /already taken/],
    ] as const) {
      fake.error = { code };
      const res = await call();
      expect(res.status).toBe(status);
      expect(((await res.json()) as { error: string }).error).toMatch(pattern);
    }
  });

  it("does not leak a database error", async () => {
    fake.error = { code: "XX000" };
    const res = await call();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("XX000");
  });
});
