import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { hitKeyed, hitSelf, rateKey, signinAllowed } from "@/lib/limits";
import { createRateLimiter } from "@/lib/rate-limit";

const SALT = "test-salt";

function fakeDb(answer: (fn: string, args: Record<string, unknown>) => { data: unknown; error: { code?: string } | null }) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    rpc(fn: string, args: Record<string, unknown> = {}) {
      calls.push({ fn, args });
      return Promise.resolve(answer(fn, args));
    },
  };
}

const memory = () => ({ email: createRateLimiter({ limit: 5, windowMs: 3_600_000 }), ip: createRateLimiter({ limit: 20, windowMs: 3_600_000 }) });

describe("database rate limits (0027)", () => {
  it("hash the key with the salt and never pass the raw value", () => {
    const k = rateKey("signin_email", " Reader@Example.com ", SALT);
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(k).toBe(rateKey("signin_email", "reader@example.com", SALT));
    expect(k).not.toBe(rateKey("signin_ip", "reader@example.com", SALT));
    expect(k).not.toBe(rateKey("signin_email", "reader@example.com", "other-salt"));
  });

  it("treat only an explicit false as limited, and fail open on errors", async () => {
    expect(await hitKeyed(fakeDb(() => ({ data: false, error: null })), "signin_ip", "a".repeat(64))).toBe(false);
    expect(await hitKeyed(fakeDb(() => ({ data: true, error: null })), "signin_ip", "a".repeat(64))).toBe(true);
    expect(await hitKeyed(fakeDb(() => ({ data: null, error: { code: "42883" } })), "signin_ip", "a".repeat(64))).toBe(true);
    expect(await hitSelf(fakeDb(() => ({ data: false, error: null })), "checkout_user")).toBe(false);
    expect(await hitSelf(fakeDb(() => ({ data: null, error: { code: "PGRST" } })), "export_user")).toBe(true);
    const throwing = { rpc: () => Promise.reject(new Error("down")) };
    expect(await hitSelf(throwing, "export_user")).toBe(true);
  });

  it("count sign-in by address and by IP, with no raw address sent", async () => {
    const db = fakeDb(() => ({ data: true, error: null }));
    expect(await signinAllowed("reader@example.com", "203.0.113.9", { client: db, salt: SALT, memory: memory() })).toBe(true);
    expect(db.calls.map((c) => c.args.p_bucket).sort()).toEqual(["signin_email", "signin_ip"]);
    expect(JSON.stringify(db.calls)).not.toMatch(/reader@example|203\.0\.113/);
  });

  it("refuse sign-in when either count is over, and stop at the memory limit first", async () => {
    const ipFull = fakeDb((_fn, args) => ({ data: args.p_bucket !== "signin_ip", error: null }));
    expect(await signinAllowed("a@example.com", "1.1.1.1", { client: ipFull, salt: SALT, memory: memory() })).toBe(false);

    const db = fakeDb(() => ({ data: true, error: null }));
    const m = memory();
    for (let i = 0; i < 5; i++) expect(await signinAllowed("b@example.com", "2.2.2.2", { client: db, salt: SALT, memory: m })).toBe(true);
    const before = db.calls.length;
    expect(await signinAllowed("b@example.com", "2.2.2.2", { client: db, salt: SALT, memory: m })).toBe(false);
    expect(db.calls.length).toBe(before);
  });

  it("still limits in memory when the database client is missing", async () => {
    const m = memory();
    for (let i = 0; i < 5; i++) await signinAllowed("c@example.com", "3.3.3.3", { client: null, salt: SALT, memory: m });
    expect(await signinAllowed("c@example.com", "3.3.3.3", { client: null, salt: SALT, memory: m })).toBe(false);
  });
});
