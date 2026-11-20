import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

/**
 * RT-6: the emailed link's landing must never send a freshly signed-in
 * reader to another site. "/%09/evil.example" decodes to a tab, which the
 * URL parser strips, leaving "//evil.example".
 */
vi.mock("server-only", () => ({}));
vi.mock("@/lib/mfa/role-mfa-server", () => ({ passkeyEnabled: async () => false }));
vi.mock("@/lib/supabase/server", () => ({
  createUserClient: async () => ({ auth: { exchangeCodeForSession: async () => ({ error: null }) } }),
}));

describe("GET /auth/callback", () => {
  it("redirects on this origin only, whatever next says", async () => {
    const { GET } = await import("./route");
    for (const next of ["/%09/evil.example/sign-in", "/%0A/evil.example", "/%5Cevil.example", "//evil.example", "https://evil.example", "/%2F/evil.example"]) {
      const res = await GET(new NextRequest(`https://akana.example/auth/callback?code=abc&next=${next}`));
      const location = new URL(res.headers.get("location") ?? "");
      expect(location.origin, next).toBe("https://akana.example");
      expect(location.pathname, next).toBe("/home");
    }
    const ok = await GET(new NextRequest("https://akana.example/auth/callback?code=abc&next=%2Fread%2Fa-b%3Funit%3D2"));
    expect(ok.headers.get("location")).toBe("https://akana.example/read/a-b?unit=2");
  });
});
