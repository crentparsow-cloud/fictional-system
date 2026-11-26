import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { eventAllowed, hitKeyed, hitKeyedState, hitSelf, hitSelfState, limiterSalt, rateKey, signinAllowed, signinDecision, signinSalt } from "@/lib/limits";
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

describe("fail closed for sign-in and export (review M5)", () => {
  const down = fakeDb(() => ({ data: null, error: { code: "57P03" } }));
  const throwing = { rpc: () => Promise.reject(new Error("down")) };

  it("keeps the three answers apart", async () => {
    expect(await hitKeyedState(fakeDb(() => ({ data: true, error: null })), "signin_ip", "a".repeat(64))).toBe("allowed");
    expect(await hitKeyedState(fakeDb(() => ({ data: false, error: null })), "signin_ip", "a".repeat(64))).toBe("limited");
    expect(await hitKeyedState(down, "signin_ip", "a".repeat(64))).toBe("unavailable");
    expect(await hitKeyedState(throwing, "signin_ip", "a".repeat(64))).toBe("unavailable");
    expect(await hitKeyedState(fakeDb(() => ({ data: null, error: null })), "signin_ip", "a".repeat(64))).toBe("unavailable");
  });

  it("refuses sign-in when the counter cannot be read or written", async () => {
    expect(await signinDecision("d@example.com", "4.4.4.4", { client: down, salt: SALT, memory: memory(), failClosed: true })).toBe("unavailable");
    expect(await signinDecision("d@example.com", "4.4.4.4", { client: throwing, salt: SALT, memory: memory(), failClosed: true })).toBe("unavailable");
    expect(await signinAllowed("d@example.com", "4.4.4.4", { client: down, salt: SALT, memory: memory(), failClosed: true })).toBe(false);
    // One count answering and the other failing is still "cannot count".
    const half = fakeDb((_fn, args) => (args.p_bucket === "signin_ip" ? { data: true, error: null } : { data: null, error: { code: "XX000" } }));
    expect(await signinDecision("d@example.com", "4.4.4.4", { client: half, salt: SALT, memory: memory(), failClosed: true })).toBe("unavailable");
  });

  it("refuses sign-in in production with no service client or no salt", async () => {
    expect(await signinDecision("e@example.com", "5.5.5.5", { client: null, salt: SALT, memory: memory(), failClosed: true })).toBe("unavailable");
    const db = fakeDb(() => ({ data: true, error: null }));
    expect(await signinDecision("e@example.com", "5.5.5.5", { client: db, salt: null, memory: memory(), failClosed: true })).toBe("unavailable");
    expect(db.calls.length).toBe(0);
    expect(signinSalt({ NODE_ENV: "production" })).toBeNull();
    expect(signinSalt({ NODE_ENV: "production", LEAD_HASH_SALT: "s" })).toBe("s");
  });

  it("says limited, not unavailable, when the database says the key is over", async () => {
    const over = fakeDb((_fn, args) => (args.p_bucket === "signin_ip" ? { data: false, error: null } : { data: null, error: { code: "XX000" } }));
    expect(await signinDecision("f@example.com", "6.6.6.6", { client: over, salt: SALT, memory: memory(), failClosed: true })).toBe("limited");
  });

  it("keeps local development and tests working", async () => {
    expect(signinSalt({ NODE_ENV: "development" })).toMatch(/dev/);
    expect(signinSalt({ NODE_ENV: "test" })).toMatch(/dev/);
    // Outside production the default is to let the memory limit decide.
    expect(await signinDecision("g@example.com", "7.7.7.7", { client: null, salt: SALT, memory: memory() })).toBe("allowed");
    expect(await signinDecision("g@example.com", "7.7.7.7", { client: down, salt: SALT, memory: memory(), failClosed: false })).toBe("allowed");
  });

  it("lets the export tell a full count from a count that could not be kept", async () => {
    expect(await hitSelfState(down, "export_user")).toBe("unavailable");
    expect(await hitSelfState(throwing, "export_user")).toBe("unavailable");
    expect(await hitSelfState(fakeDb(() => ({ data: false, error: null })), "export_user")).toBe("limited");
    expect(await hitSelfState(fakeDb(() => ({ data: true, error: null })), "export_user")).toBe("allowed");
  });

  it("leaves checkout and the partner link failing open", async () => {
    expect(await hitSelf(down, "checkout_user")).toBe(true);
    expect(await hitKeyed(down, "partner_respond_ip", "a".repeat(64))).toBe(true);
    expect(limiterSalt({ NODE_ENV: "production" })).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("analytics limits (review M5)", () => {
  it("allows a generous number per address, then stops counting", () => {
    const m = createRateLimiter({ limit: 3, windowMs: 600_000 });
    for (let i = 0; i < 3; i++) expect(eventAllowed("event", "9.9.9.9", m)).toBe(true);
    expect(eventAllowed("event", "9.9.9.9", m)).toBe(false);
    expect(eventAllowed("event", "9.9.9.8", m)).toBe(true);
  });
  it("does not lump unknown addresses together", () => {
    const m = createRateLimiter({ limit: 1, windowMs: 600_000 });
    expect(eventAllowed("funnel_anon", "unknown", m)).toBe(true);
    expect(eventAllowed("funnel_anon", "unknown", m)).toBe(true);
  });
  it("fails open when the limiter itself breaks", () => {
    const broken = { hit: () => { throw new Error("boom"); }, reset: () => {} };
    expect(eventAllowed("event", "9.9.9.9", broken)).toBe(true);
  });
});

