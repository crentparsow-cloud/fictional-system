import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The reminders cron route over a fake service role client: the secret
 * check, the RPC calls it makes, the claim and the stamp. The mailer runs
 * for real on its dev transport (no RESEND_API_KEY), so nothing leaves.
 */

type Row = {
  stripe_subscription_id: string;
  email: string;
  current_period_end: string;
  reminder_anchor_at: string;
  amount_minor: number | null;
  currency: string | null;
};

const fake = {
  rows: [] as Row[],
  claims: new Set<string>(),
  stamped: [] as { p_subscription: string; p_at: string }[],
  calls: [] as string[],
  failDue: false,
  reset() {
    this.rows = [];
    this.claims = new Set();
    this.stamped = [];
    this.calls = [];
    this.failDue = false;
  },
  async rpc(name: string, args: Record<string, unknown>) {
    this.calls.push(name);
    switch (name) {
      case "due_terms_reminders":
        if (this.failDue) return { data: null, error: { code: "XX000" } };
        return { data: this.rows.filter((r) => !this.stamped.some((s) => s.p_subscription === r.stripe_subscription_id)), error: null };
      case "claim_email": {
        const key = String(args.p_key);
        if (this.claims.has(key)) return { data: false, error: null };
        this.claims.add(key);
        return { data: true, error: null };
      }
      case "release_email":
        this.claims.delete(String(args.p_key));
        return { data: true, error: null };
      case "mark_terms_reminder_sent":
        this.stamped.push(args as { p_subscription: string; p_at: string });
        return { data: true, error: null };
      default:
        return { data: null, error: { code: "42883" } };
    }
  },
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: (name: string, args: Record<string, unknown>) => fake.rpc(name, args) }),
}));

const { GET, POST } = await import("@/app/api/membership/reminders/route");

function request(headers: Record<string, string> = {}) {
  return new NextRequest("https://akana.test/api/membership/reminders", { headers: { host: "akana.test", ...headers } });
}

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

describe("GET /api/membership/reminders", () => {
  beforeEach(() => {
    fake.reset();
    vi.stubEnv("CRON_SECRET", "a-long-enough-cron-secret");
    vi.stubEnv("EMAIL_MODE", "live");
    vi.stubEnv("EMAIL_FROM", "Akana <hello@akana.test>");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("does nothing without CRON_SECRET, or with the wrong one", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request({ authorization: "Bearer a-long-enough-cron-secret" }))).status).toBe(503);
    vi.stubEnv("CRON_SECRET", "a-long-enough-cron-secret");
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request({ authorization: "Bearer wrong" }))).status).toBe(401);
    expect(fake.calls).toEqual([]);
  });

  it("sends each due reminder once, claims its key and stamps the subscription", async () => {
    fake.rows = [
      { stripe_subscription_id: "sub_1", email: "reader@example.com", current_period_end: inDays(7), reminder_anchor_at: inDays(-200), amount_minor: 799, currency: "GBP" },
      { stripe_subscription_id: "sub_2", email: "two@example.com", current_period_end: inDays(9), reminder_anchor_at: inDays(-190), amount_minor: null, currency: null },
    ];
    const res = await GET(request({ authorization: "Bearer a-long-enough-cron-secret" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toEqual({ due: 2, sent: 1, already_sent: 0, no_price: 1, not_due: 0, failed: 0, stamp_failed: 0 });
    expect(JSON.stringify(body)).not.toMatch(/@|sub_/);
    expect([...fake.claims]).toEqual([`membership_terms_reminder:sub_1:${inDays(7).slice(0, 10)}`]);
    expect(fake.stamped.map((s) => s.p_subscription)).toEqual(["sub_1"]);

    // The next day's run sends nothing new.
    const again = await (await POST(request({ "x-cron-secret": "a-long-enough-cron-secret" }))).json();
    expect(again).toMatchObject({ due: 1, sent: 0, no_price: 1 });
    expect(fake.stamped).toHaveLength(1);
  });

  it("answers 500 when the due list cannot be read", async () => {
    fake.failDue = true;
    const res = await GET(request({ authorization: "Bearer a-long-enough-cron-secret" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "sql_failed" });
  });
});
