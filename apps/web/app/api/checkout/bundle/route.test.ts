import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHECKOUT_CONSENTS } from "@/lib/checkout-consent";
import { READER_TERMS_VERSION } from "@/lib/terms";

/**
 * POST /api/checkout/bundle over fakes: the price and titles come from the
 * server, never the body; Stripe gets a one-off payment that names a Theme
 * and a count; a pending row is written with the service role; and a failure
 * leaves no payable session behind.
 */

const TENANT = "00000000-0000-0000-0000-00000000000a";
const OTHER_TENANT = "00000000-0000-0000-0000-0000000000d1";

const fake = {
  tenant: TENANT,
  offer: null as null | { workbookIds: string[]; titleCount: number; bundleMinor: number },
  created: [] as Record<string, unknown>[],
  rows: [] as Record<string, unknown>[],
  expired: [] as string[],
  insertFails: false,
  reset() {
    this.tenant = TENANT;
    this.offer = { workbookIds: ["w1", "w2", "w3"], titleCount: 3, bundleMinor: 3000 };
    this.created = [];
    this.rows = [];
    this.expired = [];
    this.insertFails = false;
  },
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getReaderSession: async () => ({ userId: "user-1", email: "buyer@example.test" }) }));
vi.mock("@/lib/tenant-id", () => ({ tenantIdForRequest: async () => fake.tenant }));
vi.mock("@/lib/terms-server", () => ({ acceptReaderTerms: async () => true }));
vi.mock("@/lib/checkout-consent-server", () => ({ recordCheckoutConsent: async () => 7, linkCheckoutConsent: async () => true }));
vi.mock("@/lib/bundle-server", () => ({ loadBundleOffer: async () => fake.offer }));
vi.mock("@/lib/limits", () => ({ CHECKOUT_BUSY_MESSAGE: "busy", hitSelf: async () => true }));
vi.mock("@/lib/supabase/server", () => ({
  createUserClient: async () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: "Sleep" }, error: null }) }) }) }),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name !== "bundle_create") return { data: null, error: { code: "42883" } };
      if (fake.insertFails) return { data: null, error: { code: "AKX21" } };
      fake.rows.push(args);
      return { data: "b1", error: null };
    },
  }),
}));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        create: async (params: Record<string, unknown>) => {
          fake.created.push(params);
          return { id: "cs_test_bundle1", url: "https://checkout.stripe.test/cs_test_bundle1" };
        },
        expire: async (id: string) => {
          fake.expired.push(id);
        },
      },
    },
  }),
}));

const { POST } = await import("@/app/api/checkout/bundle/route");

function post(body: Record<string, unknown>) {
  return POST(new NextRequest("https://akana.test/api/checkout/bundle", { method: "POST", headers: { host: "akana.test", "content-type": "application/json" }, body: JSON.stringify(body) }));
}
const good = { theme: "sleep", terms: READER_TERMS_VERSION, consent: CHECKOUT_CONSENTS.workbook.version };

describe("POST /api/checkout/bundle", () => {
  beforeEach(() => {
    fake.reset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("starts a one-off payment at the server's price and records a pending purchase", async () => {
    const res = await post(good);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.test/cs_test_bundle1" });
    const params = fake.created[0] as { mode: string; line_items: { price_data: { unit_amount: number } }[]; metadata: Record<string, string> };
    expect(params.mode).toBe("payment");
    expect(params.line_items[0]?.price_data.unit_amount).toBe(3000);
    expect(params.metadata).toMatchObject({ kind: "bundle", theme_id: "sleep", titles: "3", tenant_id: TENANT });
    expect(fake.rows[0]).toMatchObject({ p_session: "cs_test_bundle1", p_theme: "sleep", p_workbooks: ["w1", "w2", "w3"], p_amount_minor: 3000, p_user: "user-1", p_currency: "GBP" });
  });

  it("refuses a price in the body", async () => {
    expect((await post({ ...good, amount: 1 })).status).toBe(400);
    expect(fake.created).toEqual([]);
  });

  it("needs the immediate-access consent", async () => {
    const res = await post({ theme: "sleep", terms: READER_TERMS_VERSION });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(fake.created).toEqual([]);
  });

  it("refuses when there is no offer for this reader", async () => {
    fake.offer = null;
    expect((await post(good)).status).toBe(409);
    expect(fake.created).toEqual([]);
  });

  it("is marketplace only", async () => {
    fake.tenant = OTHER_TENANT;
    expect((await post(good)).status).toBe(409);
    expect(fake.created).toEqual([]);
  });

  it("expires the session when the row cannot be written", async () => {
    fake.insertFails = true;
    expect((await post(good)).status).toBe(500);
    expect(fake.expired).toEqual(["cs_test_bundle1"]);
  });
});
