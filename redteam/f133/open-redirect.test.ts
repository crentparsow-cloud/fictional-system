import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

/**
 * RT-4. The tenant-host callback redirects off-site after a successful sign-in.
 * safeNextPath accepts "/<TAB>/evil.example"; new URL() strips the tab (WHATWG),
 * leaving "//evil.example", a scheme-relative URL on another origin.
 */
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ getAll: () => [], set: () => {} }) }));
vi.mock("@/lib/mfa/role-mfa-server", () => ({ passkeyEnabled: async () => false }));
vi.mock("@/lib/session-scope-server", () => ({ getScopedUser: async () => null }));
vi.mock("@/lib/tenant-reader", () => ({
  tenantRequest: async () => ({ tenantId: "a7300000-0000-0000-0000-0000000000b1", host: "books.tenant.example", signIn: true }),
  tenantOrigin: (h: string) => `https://${h}`,
}));
// The scoped sign-in itself succeeds: a real reader clicking their real emailed link.
vi.mock("@/lib/tenant-sign-in-server", () => ({ signInOnTenantHost: async () => ({ ok: true }) }));

describe("tenant /auth/callback open redirect", () => {
  it("sends a freshly signed-in reader to another origin", async () => {
    const { GET } = await import("@/app/site/auth/callback/route");
    const { safeNextPath } = await import("@/lib/auth");
    expect(safeNextPath("/\t/evil.example/sign-in")).toBe("/\t/evil.example/sign-in"); // passes the guard
    const res = await GET(new NextRequest("https://books.tenant.example/auth/callback?code=abc&next=/%09/evil.example/sign-in"));
    const location = res.headers.get("location");
    console.log("Location:", location);
    expect(res.status).toBeGreaterThanOrEqual(300);
    // Secure behaviour would be the tenant's own origin. This assertion documents the bad outcome.
    expect(new URL(location!).origin).toBe("https://evil.example");
  });
});
