import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * R2-5. The only bound on how many tenant sign-in codes can be asked for one
 * address is signinAllowed (app/site/sign-in/action.ts). Each code gives
 * five guesses, and each request sends the victim an email.
 *
 * Each "instance" below is a fresh copy of lib/limits.ts, as a new
 * serverless instance is. The secure expectation is 5 codes an hour per
 * address whatever the instance. Both tests fail on the current code.
 */
const ADDRESS = "victim@example.com";

async function freshInstance() {
  vi.resetModules();
  return import("@/lib/limits");
}

afterEach(() => vi.unstubAllEnvs());

describe("R2-5 the sign-in code limiter", () => {
  it("holds 5 an hour per address when the counter in the database cannot be reached", async () => {
    vi.stubEnv("LEAD_HASH_SALT", "a-real-salt");
    const broken = { rpc: async () => ({ data: null, error: { code: "PGRST301" } }) };
    let allowed = 0;
    for (let instance = 0; instance < 4; instance += 1) {
      const limits = await freshInstance();
      for (let i = 0; i < 5; i += 1) {
        if (await limits.signinAllowed(ADDRESS, `10.0.${instance}.${i}`, { client: broken, salt: limits.limiterSalt() })) allowed += 1;
      }
    }
    expect(allowed).toBeLessThanOrEqual(5);
  });

  it("counts one address under one key on every instance when LEAD_HASH_SALT is missing in production", async () => {
    vi.stubEnv("LEAD_HASH_SALT", "");
    vi.stubEnv("NODE_ENV", "production");
    const a = await freshInstance();
    const keyA = a.rateKey("signin_email", ADDRESS, a.limiterSalt());
    const b = await freshInstance();
    const keyB = b.rateKey("signin_email", ADDRESS, b.limiterSalt());
    expect(keyB).toBe(keyA);
  });
});
