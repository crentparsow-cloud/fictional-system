import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The daily upkeep route over a fake service role client: the secret check,
 * the counts it returns, and that it only reads and writes through the
 * documented functions. Student work is skipped while the coupon is blank.
 */

const fake = {
  calls: [] as string[],
  failExpire: false,
  reset() {
    this.calls = [];
    this.failExpire = false;
  },
  async rpc(name: string) {
    this.calls.push(name);
    switch (name) {
      case "refresh_social_proof":
        return { data: 3, error: null };
      case "gifts_expire":
        return this.failExpire ? { data: null, error: { code: "XX000" } } : { data: { ended: 1, unclaimed: 2 }, error: null };
      case "student_due":
        return { data: [], error: null };
      default:
        return { data: null, error: { code: "42883" } };
    }
  },
};

class Query {
  select() {
    return this;
  }
  eq() {
    return this;
  }
  is() {
    return this;
  }
  not() {
    return this;
  }
  lt() {
    return this;
  }
  in() {
    return this;
  }
  limit() {
    return this;
  }
  then<T>(res: (v: unknown) => T, rej?: (e: unknown) => T) {
    return Promise.resolve({ data: [], error: null }).then(res, rej);
  }
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: (name: string) => fake.rpc(name), from: () => new Query() }),
}));
vi.mock("@/lib/ops-alerts", () => ({ reportOps: async () => undefined }));
vi.mock("@/lib/ops-report", () => ({ reportOpsServer: async () => undefined }));

const { GET, POST } = await import("@/app/api/membership/upkeep/route");

const req = (secret?: string) =>
  new NextRequest("https://akana.test/api/membership/upkeep", { headers: { host: "akana.test", ...(secret ? { authorization: `Bearer ${secret}` } : {}) } });

describe("/api/membership/upkeep", () => {
  beforeEach(() => {
    fake.reset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("does nothing without CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req("x"))).status).toBe(503);
    expect(fake.calls).toEqual([]);
  });

  it("refuses a wrong secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    expect((await GET(req("nope"))).status).toBe(401);
    expect((await GET(req())).status).toBe(401);
    expect(fake.calls).toEqual([]);
  });

  it("returns counts only, and leaves students alone while the coupon is blank", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    vi.stubEnv("STRIPE_COUPON_STUDENT", "");
    const res = await POST(req("s3cret-value"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ proof_rows: 3, gifts_ended: 1, gifts_unclaimed: 2, gifts_resent: 0, student_rechecks: 0, student_ended: 0 });
    expect(fake.calls).toEqual(["refresh_social_proof", "gifts_expire"]);
  });

  it("checks students when the coupon is set", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    vi.stubEnv("STRIPE_COUPON_STUDENT", "STUDENT50");
    await GET(req("s3cret-value"));
    expect(fake.calls).toContain("student_due");
  });

  it("answers 500 with no detail when the database fails", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    fake.failExpire = true;
    const res = await GET(req("s3cret-value"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "upkeep_failed" });
  });
});
