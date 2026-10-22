import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The newsletter cron route over a fake service role client. The mailer is
 * replaced, so nothing can leave; what is checked is the secret, the guard,
 * the database calls and the counts.
 */
const fake = {
  calls: [] as string[],
  sends: [] as string[],
  issue: null as null | Record<string, unknown>,
  recipients: [] as { subscriber_id: string; email: string; token: string }[],
  recorded: [] as [string, boolean][],
  reset() {
    this.calls = [];
    this.sends = [];
    this.recorded = [];
    this.issue = { id: "i1", subject: "S", preheader: "", intro: "", exercise_heading: "H", exercise_body: "B", sponsor_name: null, sponsor_text: null, sponsor_url: null };
    this.recipients = [1, 2].map((n) => ({ subscriber_id: `s${n}`, email: `p${n}@example.test`, token: "a".repeat(64) }));
  },
  async rpc(name: string, args: Record<string, unknown>) {
    this.calls.push(name);
    switch (name) {
      case "newsletter_purge_pending":
        return { data: 0, error: null };
      case "newsletter_take_due_issue":
        return { data: this.issue ? [this.issue] : [], error: null };
      case "newsletter_next_recipients":
        return { data: this.recipients, error: null };
      case "newsletter_record_send":
        this.recorded.push([String(args.p_subscriber), args.p_ok === true]);
        return { data: null, error: null };
      case "newsletter_finish_issue":
        return { data: true, error: null };
      default:
        return { data: null, error: { code: "42883" } };
    }
  },
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: (name: string, args: Record<string, unknown>) => fake.rpc(name, args) }),
}));
vi.mock("@/lib/newsletter-server", () => ({
  sendIssue: async (_admin: unknown, _issue: unknown, to: { subscriberId: string }) => {
    fake.sends.push(to.subscriberId);
    return "sent";
  },
}));
vi.mock("@/lib/ops-alerts", () => ({ reportOps: vi.fn(async () => ({ alertId: null, notified: false })) }));

const { GET, POST } = await import("@/app/api/newsletter/send/route");

const SECRET = "a-long-enough-cron-secret";
const request = (headers: Record<string, string> = {}) => new NextRequest("https://akana.test/api/newsletter/send", { headers: { host: "akana.test", ...headers } });
const READY = {
  NEWSLETTER_SENDING_DOMAIN: "mail.akana.test",
  RESEND_API_KEY: "re_test_key_123",
  EMAIL_FROM: "Akana <news@mail.akana.test>",
  EMAIL_MODE: "live",
  POSTAL_ADDRESS: "1 High Street, London EC1V 2NX",
};

describe("GET /api/newsletter/send", () => {
  beforeEach(() => {
    fake.reset();
    vi.stubEnv("CRON_SECRET", SECRET);
    for (const [k, v] of Object.entries(READY)) vi.stubEnv(k, v);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("does nothing without CRON_SECRET, or with the wrong one", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request({ authorization: `Bearer ${SECRET}` }))).status).toBe(503);
    vi.stubEnv("CRON_SECRET", SECRET);
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request({ authorization: "Bearer wrong" }))).status).toBe(401);
    expect(fake.calls).toEqual([]);
  });

  it("sends nothing and touches nothing while the sending domain is blank", async () => {
    vi.stubEnv("NEWSLETTER_SENDING_DOMAIN", "");
    const res = await GET(request({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "not_ready", reason: "domain_blank", purged: 0, sent: 0, failed: 0 });
    expect(fake.calls).toEqual([]);
    expect(fake.sends).toEqual([]);
  });

  it("holds while mail is not live or the postal address is a placeholder", async () => {
    vi.stubEnv("EMAIL_MODE", "test");
    expect((await (await GET(request({ authorization: `Bearer ${SECRET}` }))).json()).reason).toBe("not_live");
    vi.stubEnv("EMAIL_MODE", "live");
    vi.stubEnv("POSTAL_ADDRESS", "PLACEHOLDER");
    expect((await (await GET(request({ authorization: `Bearer ${SECRET}` }))).json()).reason).toBe("postal_placeholder");
    expect(fake.sends).toEqual([]);
  });

  it("sends the due issue to each confirmed person, records each and finishes", async () => {
    const res = await POST(request({ "x-cron-secret": SECRET }));
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toEqual({ status: "finished", purged: 0, sent: 2, failed: 0 });
    expect(JSON.stringify(body)).not.toMatch(/@/);
    expect(fake.sends).toEqual(["s1", "s2"]);
    expect(fake.recorded).toEqual([["s1", true], ["s2", true]]);
    expect(fake.calls).toEqual(["newsletter_purge_pending", "newsletter_take_due_issue", "newsletter_next_recipients", "newsletter_record_send", "newsletter_record_send", "newsletter_finish_issue"]);
  });

  it("is idle when no issue is due", async () => {
    fake.issue = null;
    const body = await (await GET(request({ authorization: `Bearer ${SECRET}` }))).json();
    expect(body).toMatchObject({ status: "idle", sent: 0 });
    expect(fake.sends).toEqual([]);
  });
});
