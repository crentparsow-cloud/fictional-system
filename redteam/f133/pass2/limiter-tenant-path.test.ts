import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * R2-5, after the fix. The two proofs in limiter-fails-open.test.ts call
 * signinAllowed and limiterSalt, which are the Akana site's and are
 * deliberately unchanged: its sign-in must not lock readers out when the
 * limiter is down. Those two proofs therefore still fail.
 *
 * Asking for a code on a tenant host now goes through tenantSigninAllowed
 * and strictLimiterSalt (app/site/sign-in/action.ts). These are the same two
 * proofs against that path. Both pass. The bound that holds whatever the app
 * does is in the database: public.issue_tenant_sign_in_code refuses a sixth
 * code within the hour (supabase/tests/0073_tenant_sign_in.sql, block 15).
 */
const ADDRESS = "victim@example.com";

async function freshInstance() {
  vi.resetModules();
  return import("@/lib/limits");
}

afterEach(() => vi.unstubAllEnvs());

describe("R2-5 the sign-in code limiter on the tenant path", () => {
  it("holds 5 an hour per address when the counter in the database cannot be reached", async () => {
    vi.stubEnv("LEAD_HASH_SALT", "a-real-salt");
    const broken = { rpc: async () => ({ data: null, error: { code: "PGRST301" } }) };
    let allowed = 0;
    for (let instance = 0; instance < 4; instance += 1) {
      const limits = await freshInstance();
      for (let i = 0; i < 5; i += 1) {
        if (await limits.tenantSigninAllowed(ADDRESS, `10.0.${instance}.${i}`, { client: broken, salt: limits.strictLimiterSalt() })) allowed += 1;
      }
    }
    expect(allowed).toBeLessThanOrEqual(5);
    expect(allowed).toBe(0);
  });

  it("never counts one address under a per-instance key when LEAD_HASH_SALT is missing in production: every instance refuses", async () => {
    vi.stubEnv("LEAD_HASH_SALT", "");
    vi.stubEnv("NODE_ENV", "production");
    const counting = { rpc: async () => ({ data: true, error: null }) };
    const a = await freshInstance();
    const b = await freshInstance();
    expect(a.strictLimiterSalt()).toBeNull();
    expect(b.strictLimiterSalt()).toBe(a.strictLimiterSalt());
    expect(await a.tenantSigninAllowed(ADDRESS, "10.0.0.1", { client: counting, salt: a.strictLimiterSalt() })).toBe(false);
    expect(await b.tenantSigninAllowed(ADDRESS, "10.0.0.2", { client: counting, salt: b.strictLimiterSalt() })).toBe(false);
  });

  it("the tenant sign-in action calls the closed check and not the open one", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(new URL("../../../apps/web/app/site/sign-in/action.ts", import.meta.url), "utf8");
    expect(src).toContain("tenantSigninAllowed(email, clientIp(h), { client: limiterClient(), salt: strictLimiterSalt() })");
    expect(src).not.toMatch(/\blimiterSalt\b|[^t]signinAllowed\(/);
  });
});
