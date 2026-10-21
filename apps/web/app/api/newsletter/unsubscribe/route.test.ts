import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const unsub: string[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (name: string, args: { p_token: string }) => {
      if (name === "newsletter_unsubscribe") unsub.push(args.p_token);
      return { data: true, error: null };
    },
  }),
}));

const { GET, POST } = await import("@/app/api/newsletter/unsubscribe/route");
const TOKEN = "a".repeat(64);
const post = (query: string, body: string) => new NextRequest(`https://akana.test/api/newsletter/unsubscribe${query}`, { method: "POST", body });

describe("one-click newsletter unsubscribe", () => {
  beforeEach(() => void (unsub.length = 0));

  it("unsubscribes on the one-click POST only", async () => {
    const res = await POST(post(`?t=${TOKEN}`, "List-Unsubscribe=One-Click"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ unsubscribed: true });
    expect(unsub).toEqual([TOKEN]);
  });

  it("refuses a POST without the one-click body, or with a bad token", async () => {
    expect((await POST(post(`?t=${TOKEN}`, "hello=world"))).status).toBe(400);
    expect((await POST(post("?t=nope", "List-Unsubscribe=One-Click"))).status).toBe(400);
    expect((await POST(post("", "List-Unsubscribe=One-Click"))).status).toBe(400);
    expect(unsub).toEqual([]);
  });

  it("a GET changes nothing and redirects to the page with the button", () => {
    const res = GET(new NextRequest(`https://akana.test/api/newsletter/unsubscribe?t=${TOKEN}`));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`https://akana.test/newsletter/unsubscribe?t=${TOKEN}`);
    expect(unsub).toEqual([]);
    expect(GET(new NextRequest("https://akana.test/api/newsletter/unsubscribe?t=bad")).headers.get("location")).toBe("https://akana.test/newsletter");
  });
});
