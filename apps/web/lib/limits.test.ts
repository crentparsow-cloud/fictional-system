import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { hitKeyed, hitKeyedStrict, hitSelf, rateKey, signinAllowed, strictLimiterSalt, tenantSigninAllowed } from "@/lib/limits";
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

describe("R2-5: the tenant code request path fails closed", () => {
  const down = () => fakeDb(() => ({ data: null, error: { code: "PGRST301" } }));

  it("counts a hit only on an explicit true", async () => {
    expect(await hitKeyedStrict(fakeDb(() => ({ data: true, error: null })), "signin_email", "a".repeat(64))).toBe(true);
    expect(await hitKeyedStrict(fakeDb(() => ({ data: false, error: null })), "signin_email", "a".repeat(64))).toBe(false);
    expect(await hitKeyedStrict(fakeDb(() => ({ data: null, error: null })), "signin_email", "a".repeat(64))).toBe(false);
    expect(await hitKeyedStrict(down(), "signin_email", "a".repeat(64))).toBe(false);
    expect(await hitKeyedStrict({ rpc: () => Promise.reject(new Error("down")) }, "signin_email", "a".repeat(64))).toBe(false);
  });

  it("refuses when the counter errors, when there is no database client and when there is no salt", async () => {
    expect(await tenantSigninAllowed("v@example.com", "1.1.1.1", { client: down(), salt: SALT, memory: memory() })).toBe(false);
    expect(await tenantSigninAllowed("v@example.com", "1.1.1.1", { client: { rpc: () => Promise.reject(new Error("down")) }, salt: SALT, memory: memory() })).toBe(false);
    expect(await tenantSigninAllowed("v@example.com", "1.1.1.1", { client: null, salt: SALT, memory: memory() })).toBe(false);
    const db = fakeDb(() => ({ data: true, error: null }));
    expect(await tenantSigninAllowed("v@example.com", "1.1.1.1", { client: db, salt: null, memory: memory() })).toBe(false);
    expect(db.calls).toEqual([]);
  });

  it("has no per-instance salt: missing in production is null, never a made-up value", () => {
    expect(strictLimiterSalt({ NODE_ENV: "production" })).toBeNull();
    expect(strictLimiterSalt({ NODE_ENV: "production", LEAD_HASH_SALT: "  " })).toBeNull();
    expect(strictLimiterSalt({ NODE_ENV: "production", LEAD_HASH_SALT: "real" })).toBe("real");
  });

  it("allows and limits as the Akana site does while the counter works", async () => {
    const db = fakeDb(() => ({ data: true, error: null }));
    const m = memory();
    for (let i = 0; i < 5; i++) expect(await tenantSigninAllowed("ok@example.com", "2.2.2.2", { client: db, salt: SALT, memory: m })).toBe(true);
    expect(await tenantSigninAllowed("ok@example.com", "2.2.2.2", { client: db, salt: SALT, memory: m })).toBe(false);
    expect(db.calls.map((c) => c.args.p_bucket).sort().slice(0, 2)).toEqual(["signin_email", "signin_email"]);
    const full = fakeDb((_fn, args) => ({ data: args.p_bucket !== "signin_email", error: null }));
    expect(await tenantSigninAllowed("full@example.com", "3.3.3.3", { client: full, salt: SALT, memory: memory() })).toBe(false);
  });

  it("the Akana site is unchanged: its limiter still fails open", async () => {
    expect(await signinAllowed("akana@example.com", "4.4.4.4", { client: down(), salt: SALT, memory: memory() })).toBe(true);
  });

  it("the tenant sign-in action uses the closed check, and the Akana action does not", async () => {
    const fs = await import("node:fs");
    const tenant = fs.readFileSync(new URL("../app/site/sign-in/action.ts", import.meta.url), "utf8");
    expect(tenant).toContain("tenantSigninAllowed(email, clientIp(h), { client: limiterClient(), salt: strictLimiterSalt() })");
    expect(tenant).not.toMatch(/[^t]signinAllowed\(|limiterSalt\(\)[^;]*signinAllowed|\blimiterSalt\b/);
    const akana = fs.readFileSync(new URL("../app/(auth)/sign-in/action.ts", import.meta.url), "utf8");
    expect(akana).toContain("signinAllowed(email, clientIp(h), { client: limiterClient(), salt: limiterSalt() })");
  });
});
