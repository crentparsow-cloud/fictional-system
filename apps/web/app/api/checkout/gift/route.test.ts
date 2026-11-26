import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveClaimToken } from "@/lib/gift-link";
import { READER_TERMS_VERSION } from "@/lib/terms";

/**
 * POST /api/checkout/gift over fakes: the price is worked out on the server,
 * Stripe gets a one-off payment and no recipient, the pending row is written
 * with the service role, and a failure leaves no payable session behind.
 */

const TENANT = "00000000-0000-0000-0000-00000000000a";
const OTHER_TENANT = "00000000-0000-0000-0000-0000000000d1";

const fake = {
  tenant: TENANT,
  limited: false,
  rows: [] as Record<string, unknown>[],
  created: [] as Record<string, unknown>[],
  expired: [] as string[],
  insertFails: false,
  sessionTaken: false,
  stripeFails: false,
  config: [{ key: "gift_months", value: [1, 3, 6, 12] }] as { key: string; value: unknown }[],
  points: [
    { id: "member_month", kind: "membership", amounts: { GBP: 799 }, stripe_price_id: null, active: true },
    { id: "member_year", kind: "membership", amounts: { GBP: 6999 }, stripe_price_id: null, active: true },
  ] as Record<string, unknown>[],
  reset() {
    this.tenant = TENANT;
    this.limited = false;
    this.rows = [];
    this.created = [];
    this.expired = [];
    this.insertFails = false;
    this.sessionTaken = false;
    this.stripeFails = false;
  },
};

class Query {
  constructor(private table: string) {}
  select() {
    return this;
  }
  in() {
    return this;
  }
  then<T>(res: (v: unknown) => T, rej?: (e: unknown) => T) {
    const data = this.table === "app_config" ? fake.config : this.table === "price_points" ? fake.points : [];
    return Promise.resolve({ data, error: null }).then(res, rej);
  }
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getReaderSession: async () => ({ userId: "user-1", email: "buyer@example.test" }) }));
vi.mock("@/lib/tenant-id", () => ({ tenantIdForRequest: async () => fake.tenant }));
vi.mock("@/lib/terms-server", () => ({ acceptReaderTerms: async () => true }));
vi.mock("@/lib/supabase/server", () => ({
  createUserClient: async () => ({
    from: (t: string) => new Query(t),
    rpc: async (name: string) => (name === "rate_limit_self" ? { data: !fake.limited, error: null } : { data: null, error: { code: "42883" } }),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name !== "gift_create") return { data: null, error: { code: "42883" } };
      if (fake.insertFails) return { data: null, error: { code: "AKX21" } };
      if (fake.sessionTaken) return { data: null, error: { code: "23505" } };
      fake.rows.push(args);
      return { data: "gift-1", error: null };
    },
  }),
}));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => {
    if (fake.stripeFails) throw new Error("STRIPE_SECRET_KEY is not set");
    return {
      checkout: {
        sessions: {
          create: async (params: Record<string, unknown>, options?: { idempotencyKey?: string }) => {
            keys.push(options?.idempotencyKey);
            fake.created.push(params);
            return { id: "cs_test_gift1", url: "https://checkout.stripe.test/cs_test_gift1" };
          },
          expire: async (id: string) => {
            fake.expired.push(id);
          },
        },
      },
    };
  },
}));

const { POST } = await import("@/app/api/checkout/gift/route");

function post(body: Record<string, unknown>, extraHeaders: Record<string, string> = {}) {
  return POST(
    new NextRequest("https://akana.test/api/checkout/gift", {
      method: "POST",
      headers: { host: "akana.test", "content-type": "application/json", ...extraHeaders },
      body: JSON.stringify(body),
    }),
  );
}

const good = { months: 3, recipientEmail: "Friend@Example.test", recipientName: "Fran", senderName: "Sam", message: "Happy reading.", terms: READER_TERMS_VERSION };

/** L6: the idempotency key each Checkout Session was created with. */
const keys = vi.hoisted(() => [] as (string | undefined)[]);

describe("POST /api/checkout/gift", () => {
  beforeEach(() => {
    fake.reset();
    vi.stubEnv("GIFT_LINK_SECRET", "a-test-gift-link-secret-of-32-chars!");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("where Stripe sends the buyer back (review L2)", () => {
    const urls = () => {
      const p = fake.created[0] as { success_url: string; cancel_url: string };
      return [p.success_url, p.cancel_url];
    };
    afterEach(() => vi.unstubAllEnvs());

    it("uses the configured address in production, whatever Host and X-Forwarded-Host say", async () => {
      vi.stubEnv("AKANA_HOST", "akana.example");
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://akana.example");
      await post(good, { host: "evil.example", "x-forwarded-host": "evil.example", "x-forwarded-proto": "http" });
      expect(urls()).toEqual(["https://akana.example/gift?thanks=1", "https://akana.example/gift"]);
    });

    it("keeps a preview's own address when the request came in on it, and no other", async () => {
      vi.stubEnv("AKANA_HOST", "");
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
      vi.stubEnv("VERCEL_ENV", "preview");
      vi.stubEnv("VERCEL_BRANCH_URL", "akana-git-fix.vercel.app");
      vi.stubEnv("VERCEL_URL", "akana-def456.vercel.app");
      await post(good, { host: "akana-def456.vercel.app" });
      expect(urls()[0]).toBe("https://akana-def456.vercel.app/gift?thanks=1");
      fake.reset();
      await post(good, { host: "evil.example" });
      expect(urls()[0]).toBe("https://akana-git-fix.vercel.app/gift?thanks=1");
    });

    it("works on localhost on any port", async () => {
      vi.stubEnv("AKANA_HOST", "localhost:3000");
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
      for (const k of ["VERCEL_ENV", "VERCEL_BRANCH_URL", "VERCEL_URL", "VERCEL_PROJECT_PRODUCTION_URL"]) vi.stubEnv(k, "");
      await post(good, { host: "localhost:3101" });
      expect(urls()).toEqual(["http://localhost:3101/gift?thanks=1", "http://localhost:3101/gift"]);
    });
  });

  it("starts a one-off payment at the worked-out price and records a pending gift", async () => {
    const res = await post(good);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.test/cs_test_gift1" });
    const params = fake.created[0] as { mode: string; line_items: { price_data: { unit_amount: number } }[]; metadata: Record<string, string> };
    expect(params.mode).toBe("payment");
    expect(params.line_items[0]?.price_data.unit_amount).toBe(2397);
    expect(params.metadata).toMatchObject({ kind: "gift", months: "3", tenant_id: TENANT });
    expect(JSON.stringify(params)).not.toMatch(/friend|Fran|Happy/i);
    const row = fake.rows[0]!;
    expect(row).toMatchObject({ p_session: "cs_test_gift1", p_months: 3, p_recipient_email: "friend@example.test", p_amount_minor: 2397, p_buyer: "user-1", p_currency: "GBP" });
    // 0076 (review finding L12): the token is derived from the session id, so the database need only keep its hash.
    expect(String(row.p_token)).toHaveLength(43);
    expect(row.p_token).toBe(deriveClaimToken("cs_test_gift1", "a-test-gift-link-secret-of-32-chars!"));
  });

  it("starts no gift, and leaves no payable session, when there is no secret to derive the link from", async () => {
    vi.stubEnv("GIFT_LINK_SECRET", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const res = await post(good);
    expect(res.status).toBe(503);
    expect(fake.rows).toHaveLength(0);
    expect(fake.expired).toEqual(["cs_test_gift1"]);
  });

  it("uses the annual price for 12 months", async () => {
    await post({ ...good, months: 12 });
    expect((fake.created[0] as { line_items: { price_data: { unit_amount: number } }[] }).line_items[0]?.price_data.unit_amount).toBe(6999);
  });

  it("ignores any price in the body", async () => {
    const res = await post({ ...good, priceMinor: 1 });
    expect(res.status).toBe(400);
    expect(fake.created).toEqual([]);
  });

  it("refuses a length that is not offered, a bad address and the buyer's own", async () => {
    expect(((await (await post({ ...good, months: 2 })).json()) as { code: string }).code).toBe("months");
    expect(((await (await post({ ...good, recipientEmail: "nope" })).json()) as { code: string }).code).toBe("recipient_email");
    expect(((await (await post({ ...good, recipientEmail: "buyer@example.test" })).json()) as { code: string }).code).toBe("own_email");
    expect(fake.created).toEqual([]);
  });

  it("needs the terms version", async () => {
    const res = await post({ ...good, terms: undefined });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("terms_required");
  });

  it("is not open on a white-label site", async () => {
    fake.tenant = OTHER_TENANT;
    expect((await post(good)).status).toBe(409);
    expect(fake.created).toEqual([]);
  });

  it("falls back to the config prices when the price rows are missing", async () => {
    const saved = fake.points.splice(0);
    const res = await post(good);
    fake.points.push(...saved);
    expect(res.status).toBe(200);
  });

  it("answers 503 without Stripe and 429 when the reader is over their limit", async () => {
    fake.stripeFails = true;
    expect((await post(good)).status).toBe(503);
    fake.stripeFails = false;
    fake.limited = true;
    expect((await post(good)).status).toBe(429);
    expect(fake.created).toEqual([]);
  });

  it("expires the session when the row cannot be written", async () => {
    fake.insertFails = true;
    expect((await post(good)).status).toBe(500);
    expect(fake.expired).toEqual(["cs_test_gift1"]);
  });
});

describe("POST /api/checkout/gift: one Checkout Session for one attempt (L6)", () => {
  beforeEach(() => {
    fake.reset();
    keys.length = 0;
    vi.stubEnv("GIFT_LINK_SECRET", "a-test-gift-link-secret-of-32-chars!");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("gives the same gift asked for twice the same key, and a different gift a different one", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-25T10:00:10Z"), toFake: ["Date"] });
    try {
      expect((await post(good)).status).toBe(200);
      expect((await post(good)).status).toBe(200);
      expect((await post({ ...good, recipientEmail: "other@example.test" })).status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
    expect(keys[0]).toMatch(/^akana-checkout-gift-[0-9a-f]{48}$/);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("when the repeat finds the gift already recorded, the session stands and is not expired", async () => {
    fake.sessionTaken = true;
    const res = await post(good);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.test/cs_test_gift1" });
    expect(fake.expired).toEqual([]);
  });
});
