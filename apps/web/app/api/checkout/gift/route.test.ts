import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
          create: async (params: Record<string, unknown>) => {
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

function post(body: Record<string, unknown>) {
  return POST(
    new NextRequest("https://akana.test/api/checkout/gift", {
      method: "POST",
      headers: { host: "akana.test", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const good = { months: 3, recipientEmail: "Friend@Example.test", recipientName: "Fran", senderName: "Sam", message: "Happy reading.", terms: READER_TERMS_VERSION };

describe("POST /api/checkout/gift", () => {
  beforeEach(() => {
    fake.reset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

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
    expect(String(row.p_token)).toHaveLength(32);
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
