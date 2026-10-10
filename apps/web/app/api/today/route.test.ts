import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Today cron routes: the secret check comes first and nothing is read
 * before it passes. The calendar feed answers 404 to anything that is not a
 * well-formed token that resolves.
 */

vi.mock("server-only", () => ({}));

const calls: string[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (name: string) => {
      calls.push(name);
      return { data: [], error: null };
    },
    from: () => {
      calls.push("from");
      throw new Error("no tables in this test");
    },
  }),
}));

const reminders = await import("@/app/api/today/reminders/route");
const pickup = await import("@/app/api/today/pickup/route");
const review = await import("@/app/api/today/review-candidates/route");
const calendar = await import("@/app/api/today/calendar/[token]/route");

const req = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(`https://akana.test${path}`, { headers: { host: "akana.test", ...headers } });

describe("Today cron routes", () => {
  beforeEach(() => {
    calls.length = 0;
    vi.stubEnv("CRON_SECRET", "a-long-enough-cron-secret");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  for (const [name, mod, path] of [
    ["reminders", reminders, "/api/today/reminders"],
    ["pickup", pickup, "/api/today/pickup"],
    ["review-candidates", review, "/api/today/review-candidates"],
  ] as const) {
    it(`${name}: 503 without a secret, 401 with the wrong one, and no reads either way`, async () => {
      vi.stubEnv("CRON_SECRET", "");
      expect((await mod.GET(req(path, { authorization: "Bearer a-long-enough-cron-secret" }))).status).toBe(503);
      vi.stubEnv("CRON_SECRET", "a-long-enough-cron-secret");
      expect((await mod.GET(req(path))).status).toBe(401);
      expect((await mod.POST(req(path, { authorization: "Bearer nope" }))).status).toBe(401);
      expect(calls).toEqual([]);
    });
  }
});

describe("GET /api/today/calendar/[token]", () => {
  const ctx = (token: string) => ({ params: Promise.resolve({ token }) });
  it("answers 404 to a malformed token without looking anything up", async () => {
    calls.length = 0;
    for (const t of ["", "short", "z".repeat(64), "A".repeat(64), "a".repeat(63)]) {
      const res = await calendar.GET(req(`/api/today/calendar/${t}`), ctx(t));
      expect(res.status).toBe(404);
    }
    expect(calls).toEqual([]);
  });
  it("answers 404 when the token matches nothing", async () => {
    const t = "a".repeat(64);
    const res = await calendar.GET(req(`/api/today/calendar/${t}`), ctx(t));
    expect(res.status).toBe(404);
  });
});
