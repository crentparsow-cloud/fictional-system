import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHECKOUT_CONSENTS, CONSENT_CHANGED_MESSAGE, CONSENT_REQUIRED_MESSAGE } from "@/lib/checkout-consent";
import { READER_TERMS_VERSION } from "@/lib/terms";

/**
 * POST /api/checkout/membership over fakes. Covers the 14-day pro rata
 * refund consent (0019): refused without it, recorded before Stripe,
 * carried in the session and subscription metadata, linked to the session.
 */

const TENANT = "00000000-0000-0000-0000-00000000000a";

const fake = {
  rpcs: [] as { name: string; args: Record<string, unknown> }[],
  limits: [] as string[],
  limited: false,
  recordFails: false,
  linkFails: false,
  purchases: [] as Record<string, unknown>[],
  created: [] as Record<string, unknown>[],
  expired: [] as string[],
  reset() {
    this.rpcs = [];
    this.limits = [];
    this.limited = false;
    this.recordFails = false;
    this.linkFails = false;
    this.purchases = [];
    this.created = [];
    this.expired = [];
  },
  rpc(name: string, args: Record<string, unknown>) {
    // F-143 (0027): the per-reader checkout limit, kept apart from the consent calls.
    if (name === "rate_limit_self") {
      this.limits.push(String(args.p_bucket));
      return { data: !this.limited, error: null };
    }
    this.rpcs.push({ name, args });
    if (name === "record_checkout_consent") return this.recordFails ? { data: null, error: { code: "AKC29" } } : { data: 91, error: null };
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
  maybeSingle() {
    return Promise.resolve(this.table === "profiles" ? { data: { country: "GB" }, error: null } : { data: null, error: null });
  }
  then<T>(res: (v: unknown) => T, rej?: (e: unknown) => T) {
    return Promise.resolve({ data: [], error: null }).then(res, rej);
  }
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getReaderSession: async () => ({ userId: "user-1", email: "reader@test" }) }));
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
          return { id: "cs_test_member1", url: "https://checkout.stripe.test/cs_test_member1" };
        },
        expire: async (id: string) => {
          fake.expired.push(id);
        },
      },
    },
  }),
}));

const { POST } = await import("@/app/api/checkout/membership/route");

function post(body: Record<string, unknown>) {
  return POST(
    new NextRequest("https://akana.test/api/checkout/membership", {
      method: "POST",
      headers: { host: "akana.test", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const good = { plan: "monthly", workbook: "calm-week", terms: READER_TERMS_VERSION, consent: CHECKOUT_CONSENTS.membership.version };

describe("POST /api/checkout/membership: pro rata refund consent", () => {
  beforeEach(() => {
    fake.reset();
    vi.stubEnv("STRIPE_PRICE_MEMBERSHIP_MONTHLY", "price_test_monthly");
    vi.stubEnv("STRIPE_PRICE_MEMBERSHIP_YEARLY", "price_test_yearly");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("refuses with 409 consent_required when the box was not ticked", async () => {
    const res = await post({ plan: "monthly", terms: READER_TERMS_VERSION });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: CONSENT_REQUIRED_MESSAGE, code: "consent_required" });
    expect(fake.rpcs).toEqual([]);
    expect(fake.created).toEqual([]);
  });

  it("refuses the single workbook wording for a membership", async () => {
    const res = await post({ ...good, consent: CHECKOUT_CONSENTS.workbook.version });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: CONSENT_CHANGED_MESSAGE, code: "consent_changed" });
  });

  it("records the consent for the plan, carries it in both metadata sets and links it", async () => {
    const res = await post({ ...good, plan: "yearly" });
    expect(res.status).toBe(200);
    expect(fake.rpcs.map((r) => r.name)).toEqual(["record_checkout_consent", "link_checkout_consent"]);
    expect(fake.rpcs[0]?.args).toEqual({
      p_kind: "membership",
      p_version: CHECKOUT_CONSENTS.membership.version,
      p_tenant: TENANT,
      p_workbook: null,
      p_plan: "member_year",
    });
    expect(fake.rpcs[1]?.args).toEqual({ p_id: 91, p_session: "cs_test_member1" });
    const params = fake.created[0] as { metadata: Record<string, string>; subscription_data: { metadata: Record<string, string> } };
    const meta = { consent_id: "91", consent_version: CHECKOUT_CONSENTS.membership.version };
    expect(params.metadata).toMatchObject({ ...meta, plan: "member_year", user_id: "user-1" });
    expect(params.subscription_data.metadata).toMatchObject({ ...meta, plan: "member_year", tenant_id: TENANT });
    expect(fake.purchases).toHaveLength(1);
  });

  it("refuses with 429 after the reader's hourly checkout limit (F-143), before recording anything", async () => {
    fake.limited = true;
    const res = await post(good);
    expect(res.status).toBe(429);
    expect(((await res.json()) as { code?: string }).code).toBe("rate_limited");
    expect(fake.limits).toEqual(["checkout_user"]);
    expect(fake.rpcs).toEqual([]);
    expect(fake.created).toEqual([]);
  });

  it("does not open Stripe when the consent cannot be recorded", async () => {
    fake.recordFails = true;
    const res = await post(good);
    expect(res.status).toBe(500);
    expect(fake.created).toEqual([]);
  });

  it("expires the session and writes no purchase when the link fails", async () => {
    fake.linkFails = true;
    const res = await post(good);
    expect(res.status).toBe(500);
    expect(fake.expired).toEqual(["cs_test_member1"]);
    expect(fake.purchases).toEqual([]);
  });
});
