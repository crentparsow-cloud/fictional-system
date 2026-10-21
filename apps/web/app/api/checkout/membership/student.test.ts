import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHECKOUT_CONSENTS } from "@/lib/checkout-consent";
import { READER_TERMS_VERSION } from "@/lib/terms";

/**
 * The student price on POST /api/checkout/membership (14.22): the coupon is
 * pinned only for a confirmed, current verification, on a single-person
 * plan, with the feature switched on, and never together with a code.
 */

const TENANT = "00000000-0000-0000-0000-00000000000a";

const fake = {
  verification: null as { verified_at: string | null; expires_at: string | null } | null,
  created: [] as Record<string, unknown>[],
  reset() {
    this.verification = null;
    this.created = [];
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
    if (this.table === "student_verifications") return Promise.resolve({ data: fake.verification, error: null });
    return Promise.resolve({ data: this.table === "profiles" ? { country: "GB" } : null, error: null });
  }
  then<T>(res: (v: unknown) => T, rej?: (e: unknown) => T) {
    const rows = this.table === "app_config" ? [{ key: "student_discount_percent", value: 50 }] : [];
    return Promise.resolve({ data: rows, error: null }).then(res, rej);
  }
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getReaderSession: async () => ({ userId: "user-1", email: "student@uni.ac.uk" }) }));
vi.mock("@/lib/tenant-id", () => ({ tenantIdForRequest: async () => TENANT }));
vi.mock("@/lib/funnel", () => ({ countFunnelEvent: async () => undefined }));
vi.mock("@/lib/terms-server", () => ({ acceptReaderTerms: async () => true }));
vi.mock("@/lib/membership-trial-server", () => ({ loadTrialConfig: async () => ({ monthly: 14, yearly: 21 }) }));
vi.mock("@/lib/supabase/server", () => ({
  createUserClient: async () => ({
    from: (t: string) => new Query(t),
    rpc: async (name: string) => {
      if (name === "rate_limit_self") return { data: true, error: null };
      if (name === "record_checkout_consent") return { data: 91, error: null };
      if (name === "link_checkout_consent") return { data: true, error: null };
      return { data: null, error: { code: "42883" } };
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({ insert: async () => ({ error: null }) }) }) }));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        create: async (params: Record<string, unknown>) => {
          fake.created.push(params);
          return { id: "cs_test_student1", url: "https://checkout.stripe.test/cs_test_student1" };
        },
        expire: async () => undefined,
      },
    },
  }),
}));

const { POST } = await import("@/app/api/checkout/membership/route");

const post = (body: Record<string, unknown>) =>
  POST(new NextRequest("https://akana.test/api/checkout/membership", { method: "POST", headers: { host: "akana.test", "content-type": "application/json" }, body: JSON.stringify(body) }));

const base = { plan: "monthly", terms: READER_TERMS_VERSION, consent: CHECKOUT_CONSENTS.membership.version, student: true };
const running = () => ({ verified_at: new Date(Date.now() - 86_400_000).toISOString(), expires_at: new Date(Date.now() + 200 * 86_400_000).toISOString() });

describe("POST /api/checkout/membership with student true", () => {
  beforeEach(() => {
    fake.reset();
    vi.stubEnv("STRIPE_PRICE_MEMBERSHIP_MONTHLY", "price_test_monthly");
    vi.stubEnv("STRIPE_PRICE_MEMBERSHIP_YEARLY", "price_test_yearly");
    vi.stubEnv("STRIPE_PRICE_MEMBERSHIP_TWO_MONTHLY", "price_test_two_monthly");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("refuses while the coupon id is blank", async () => {
    fake.verification = running();
    const res = await post(base);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/not open yet/);
    expect(fake.created).toEqual([]);
  });

  it("refuses a reader who has not confirmed an academic email", async () => {
    vi.stubEnv("STRIPE_COUPON_STUDENT", "STUDENT50");
    const res = await post(base);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("student_required");
    expect(fake.created).toEqual([]);
  });

  it("refuses a verification that has run out", async () => {
    vi.stubEnv("STRIPE_COUPON_STUDENT", "STUDENT50");
    fake.verification = { verified_at: "2025-01-01T00:00:00Z", expires_at: "2026-01-01T00:00:00Z" };
    expect((await post(base)).status).toBe(409);
    expect(fake.created).toEqual([]);
  });

  it("refuses the shared plans and a code", async () => {
    vi.stubEnv("STRIPE_COUPON_STUDENT", "STUDENT50");
    fake.verification = running();
    expect((await post({ ...base, plan: "two_monthly" })).status).toBe(409);
    expect((await post({ ...base, code: "WELCOME" })).status).toBe(409);
    expect(fake.created).toEqual([]);
  });

  it("pins the coupon for a confirmed student and states the discounted price", async () => {
    vi.stubEnv("STRIPE_COUPON_STUDENT", "STUDENT50");
    fake.verification = running();
    const res = await post(base);
    expect(res.status).toBe(200);
    const p = fake.created[0] as {
      discounts?: { coupon?: string }[];
      allow_promotion_codes?: boolean;
      subscription_data?: { metadata?: Record<string, string> };
      custom_text?: { submit?: { message?: string } };
    };
    expect(p.discounts).toEqual([{ coupon: "STUDENT50" }]);
    expect(p.allow_promotion_codes).toBeUndefined();
    expect(p.subscription_data?.metadata?.student).toBe("1");
    // 50 percent off £7.99 renews at £4.00 in the notice, not at £7.99
    expect(p.custom_text?.submit?.message).toContain("£4.00");
    expect(p.custom_text?.submit?.message).not.toContain("£7.99");
  });

  it("leaves an ordinary checkout alone", async () => {
    vi.stubEnv("STRIPE_COUPON_STUDENT", "STUDENT50");
    fake.verification = running();
    await post({ ...base, student: undefined });
    const p = fake.created[0] as { discounts?: unknown; allow_promotion_codes?: boolean; subscription_data?: { metadata?: Record<string, string> } };
    expect(p.discounts).toBeUndefined();
    expect(p.allow_promotion_codes).toBe(true);
    expect(p.subscription_data?.metadata?.student).toBeUndefined();
  });
});
