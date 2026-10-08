import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHECKOUT_CONSENTS, CONSENT_CHANGED_MESSAGE, CONSENT_REQUIRED_MESSAGE } from "@/lib/checkout-consent";
import { READER_TERMS_VERSION } from "@/lib/terms";

/**
 * POST /api/checkout over fakes: the reader's Supabase client, the service
 * role client and Stripe. Covers the immediate-access consent (0019) and
 * the price the route charges (F-094).
 */

const TENANT = "00000000-0000-0000-0000-00000000000a";
const WORKBOOK = { id: "wb-1", code: "AK-TEST1", slug: "calm-week", tenant_id: TENANT, is_demo: false, status: "live", price_point_id: "p3", in_membership: true };

const fake = {
  session: { userId: "user-1", email: "reader@test" } as { userId: string; email: string } | null,
  country: "GB" as string | null,
  amounts: { GBP: 1200 } as Record<string, number>,
  rpcs: [] as { name: string; args: Record<string, unknown> }[],
  limits: [] as string[],
  limited: false,
  recordFails: false,
  linkFails: false,
  purchases: [] as Record<string, unknown>[],
  created: [] as Record<string, unknown>[],
  expired: [] as string[],
  reset() {
    this.session = { userId: "user-1", email: "reader@test" };
    this.country = "GB";
    this.amounts = { GBP: 1200 };
    this.rpcs = [];
    this.limits = [];
    this.limited = false;
    this.recordFails = false;
    this.linkFails = false;
    this.purchases = [];
    this.created = [];
    this.expired = [];
  },
  single(table: string) {
    switch (table) {
      case "workbooks":
        return { data: WORKBOOK, error: null };
      case "price_points":
        return { data: { id: "p3", kind: "workbook", amounts: this.amounts, stripe_price_id: null, active: true }, error: null };
      case "profiles":
        return { data: { country: this.country }, error: null };
      default:
        return { data: null, error: null };
    }
  },
  many(table: string) {
    return { data: table === "entitlements" ? [] : [], error: null };
  },
  rpc(name: string, args: Record<string, unknown>) {
    // F-143 (0027): the per-reader checkout limit, kept apart from the consent calls.
    if (name === "rate_limit_self") {
      this.limits.push(String(args.p_bucket));
      return { data: !this.limited, error: null };
    }
    this.rpcs.push({ name, args });
    if (name === "record_checkout_consent") return this.recordFails ? { data: null, error: { code: "AKC02" } } : { data: 77, error: null };
    if (name === "link_checkout_consent") return this.linkFails ? { data: null, error: { code: "AKC01" } } : { data: true, error: null };
    return { data: null, error: { code: "42883" } };
  },
};

class Query {
  constructor(private table: string) {}
  select() {
    return this;
  }
  eq() {
    return this;
  }
  or() {
    return this;
  }
  in() {
    return this;
  }
  maybeSingle() {
    return Promise.resolve(fake.single(this.table));
  }
  then<T>(res: (v: unknown) => T, rej?: (e: unknown) => T) {
    return Promise.resolve(fake.many(this.table)).then(res, rej);
  }
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getReaderSession: async () => fake.session }));
vi.mock("@/lib/tenant-id", () => ({ tenantIdForRequest: async () => TENANT }));
vi.mock("@/lib/funnel", () => ({ countFunnelEvent: async () => undefined }));
vi.mock("@/lib/terms-server", () => ({ acceptReaderTerms: async () => true }));
vi.mock("@/lib/supabase/server", () => ({
  createUserClient: async () => ({
    from: (t: string) => new Query(t),
    rpc: async (name: string, args: Record<string, unknown>) => fake.rpc(name, args),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        fake.purchases.push(row);
        return { error: null };
      },
    }),
  }),
}));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        create: async (params: Record<string, unknown>) => {
          fake.created.push(params);
          return { id: "cs_test_route1", url: "https://checkout.stripe.test/cs_test_route1" };
        },
        expire: async (id: string) => {
          fake.expired.push(id);
        },
      },
    },
  }),
}));

const { POST } = await import("@/app/api/checkout/route");

function post(body: Record<string, unknown>) {
  return POST(
    new NextRequest("https://akana.test/api/checkout", {
      method: "POST",
      headers: { host: "akana.test", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const good = { workbook: "calm-week", terms: READER_TERMS_VERSION, consent: CHECKOUT_CONSENTS.workbook.version };

describe("POST /api/checkout: immediate-access consent", () => {
  beforeEach(() => {
    fake.reset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("refuses with 409 consent_required when the box was not ticked, and records nothing", async () => {
    const res = await post({ workbook: good.workbook, terms: good.terms });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: CONSENT_REQUIRED_MESSAGE, code: "consent_required" });
    expect(fake.rpcs).toEqual([]);
    expect(fake.created).toEqual([]);
  });

  it("refuses with 409 consent_changed for an old or wrong wording", async () => {
    for (const consent of ["immediate-access-1999-01", CHECKOUT_CONSENTS.membership.version]) {
      const res = await post({ ...good, consent });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: CONSENT_CHANGED_MESSAGE, code: "consent_changed" });
    }
    expect(fake.created).toEqual([]);
  });

  it("checks the reader terms first, as before", async () => {
    const res = await post({ workbook: "calm-week", consent: CHECKOUT_CONSENTS.workbook.version });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("terms_required");
  });

  it("records the consent before Stripe, carries it in metadata and links it to the session", async () => {
    const res = await post(good);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.test/cs_test_route1" });

    expect(fake.rpcs.map((r) => r.name)).toEqual(["record_checkout_consent", "link_checkout_consent"]);
    expect(fake.rpcs[0]?.args).toEqual({
      p_kind: "workbook",
      p_version: CHECKOUT_CONSENTS.workbook.version,
      p_tenant: TENANT,
      p_workbook: "wb-1",
      p_plan: null,
    });
    expect(fake.rpcs[1]?.args).toEqual({ p_id: 77, p_session: "cs_test_route1" });

    const params = fake.created[0] as { metadata: Record<string, string>; custom_text: { submit: { message: string } } };
    expect(params.metadata).toMatchObject({ consent_id: "77", consent_version: CHECKOUT_CONSENTS.workbook.version, workbook_id: "wb-1" });
    expect(params.custom_text.submit.message).toMatch(/14-day right to cancel/);
    expect(fake.purchases[0]).toMatchObject({ stripe_checkout_session_id: "cs_test_route1", currency: "GBP", amount_minor: 1200 });
  });

  it("refuses with 429 after the reader's hourly checkout limit (F-143), before recording anything", async () => {
    fake.limited = true;
    const res = await post(good);
    expect(res.status).toBe(429);
    expect(((await res.json()) as { code?: string }).code).toBe("rate_limited");
    expect(fake.limits).toEqual(["checkout_user"]);
    expect(fake.rpcs).toEqual([]);
    expect(fake.created).toEqual([]);
    expect(fake.purchases).toEqual([]);
  });

  it("does not open Stripe when the consent cannot be recorded", async () => {
    fake.recordFails = true;
    const res = await post(good);
    expect(res.status).toBe(500);
    expect(fake.created).toEqual([]);
    expect(fake.purchases).toEqual([]);
  });

  it("expires the session and writes no purchase when the link fails", async () => {
    fake.linkFails = true;
    const res = await post(good);
    expect(res.status).toBe(500);
    expect(fake.expired).toEqual(["cs_test_route1"]);
    expect(fake.purchases).toEqual([]);
  });
});

describe("POST /api/checkout: the charged price matches the shown price (F-094)", () => {
  beforeEach(() => {
    fake.reset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("charges GBP to a reader abroad when there is no figure in their currency", async () => {
    fake.country = "US";
    const res = await post(good);
    expect(res.status).toBe(200);
    const line = (fake.created[0] as { line_items: { price_data: { currency: string; unit_amount: number } }[] }).line_items[0];
    expect(line?.price_data).toMatchObject({ currency: "gbp", unit_amount: 1200 });
    expect(fake.purchases[0]).toMatchObject({ currency: "GBP", amount_minor: 1200 });
  });

  it("charges the market currency where price_points has a figure for it", async () => {
    fake.country = "US";
    fake.amounts = { GBP: 1200, USD: 1500 };
    await post(good);
    const line = (fake.created[0] as { line_items: { price_data: { currency: string; unit_amount: number } }[] }).line_items[0];
    expect(line?.price_data).toMatchObject({ currency: "usd", unit_amount: 1500 });
  });

  it("refuses 'Price to be confirmed' when there is no usable figure", async () => {
    fake.amounts = {};
    const res = await post(good);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Price to be confirmed.");
    expect(fake.rpcs).toEqual([]);
  });
});
