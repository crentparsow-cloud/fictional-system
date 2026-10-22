import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The win-back cron route over a fake service role client: the secret check,
 * the switch, the claim before the send and the release after a failure. The
 * mailer runs on its dev transport (no RESEND_API_KEY), so nothing leaves.
 */

type Row = { user_id: string; email: string; kind: "monthly" | "one_off" };

const fake = {
  rows: [] as Row[],
  claimed: new Map<string, string>(),
  claims: new Set<string>(),
  calls: [] as string[],
  failDue: false,
  reset() {
    this.rows = [];
    this.claimed = new Map();
    this.claims = new Set();
    this.calls = [];
    this.failDue = false;
  },
  async rpc(name: string, args: Record<string, unknown>) {
    this.calls.push(name);
    switch (name) {
      case "due_winback":
        if (this.failDue) return { data: null, error: { code: "XX000" } };
        return { data: this.rows.filter((r) => !this.claimed.has(`${r.user_id}:${String(args.p_season)}`)), error: null };
      case "winback_claim": {
        const k = `${String(args.p_user)}:${String(args.p_season)}`;
        if (this.claimed.has(k)) return { data: false, error: null };
        this.claimed.set(k, String(args.p_token_hash));
        return { data: true, error: null };
      }
      case "winback_release":
        this.claimed.delete(`${String(args.p_user)}:${String(args.p_season)}`);
        return { data: true, error: null };
      case "claim_email": {
        const key = String(args.p_key);
        if (this.claims.has(key)) return { data: false, error: null };
        this.claims.add(key);
        return { data: true, error: null };
      }
      case "release_email":
        this.claims.delete(String(args.p_key));
        return { data: true, error: null };
      default:
        return { data: null, error: { code: "42883" } };
    }
  },
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (name: string, args: Record<string, unknown>) => fake.rpc(name, args),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: 50 }, error: null }) }) }) }),
  }),
}));
vi.mock("@/lib/ops-alerts", () => ({ reportOps: async () => undefined }));
vi.mock("@/lib/ops-report", () => ({ reportOpsServer: async () => undefined }));

const { GET, POST } = await import("@/app/api/membership/winback/route");

const req = (secret?: string) =>
  new NextRequest("https://akana.test/api/membership/winback", { headers: { host: "akana.test", ...(secret ? { authorization: `Bearer ${secret}` } : {}) } });

const env = (over: Record<string, string> = {}) => {
  vi.stubEnv("CRON_SECRET", "s3cret-value");
  vi.stubEnv("WINBACK_ENABLED", "true");
  vi.stubEnv("POSTAL_ADDRESS", "Akana Ltd, 1 Example Street, Edinburgh");
  vi.stubEnv("EMAIL_MODE", "test");
  vi.stubEnv("TEST_RECIPIENT", "inbox@akana.test");
  vi.stubEnv("EMAIL_FROM", "Akana <hello@akana.test>");
  for (const [k, v] of Object.entries(over)) vi.stubEnv(k, v);
};

describe("/api/membership/winback", () => {
  beforeEach(() => {
    fake.reset();
    vi.spyOn(console, "info").mockImplementation(() => {});
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
    env();
    expect((await GET(req("nope"))).status).toBe(401);
    expect((await GET(req())).status).toBe(401);
    expect(fake.calls).toEqual([]);
  });

  it("does nothing while WINBACK_ENABLED is blank", async () => {
    env({ WINBACK_ENABLED: "" });
    fake.rows = [{ user_id: "u1", email: "a@example.test", kind: "monthly" }];
    const res = await GET(req("s3cret-value"));
    expect(await res.json()).toEqual({ enabled: false });
    expect(fake.calls).toEqual([]);
  });

  it("claims the season, sends once and sends nothing new on a second run", async () => {
    env();
    fake.rows = [
      { user_id: "u1", email: "a@example.test", kind: "monthly" },
      { user_id: "u2", email: "b@example.test", kind: "one_off" },
    ];
    const first = (await (await GET(req("s3cret-value"))).json()) as Record<string, unknown>;
    expect(first).toMatchObject({ enabled: true, due: 2, sent: 2, failed: 0 });
    expect(fake.calls.indexOf("winback_claim")).toBeLessThan(fake.calls.indexOf("claim_email"));
    // the stored token is a hash, never the token
    for (const h of fake.claimed.values()) expect(h).toMatch(/^[0-9a-f]{64}$/);
    const second = (await (await POST(req("s3cret-value"))).json()) as Record<string, unknown>;
    expect(second).toMatchObject({ due: 0, sent: 0 });
  });

  it("never returns an address", async () => {
    env();
    fake.rows = [{ user_id: "u1", email: "private@example.test", kind: "monthly" }];
    const text = await (await GET(req("s3cret-value"))).text();
    expect(text).not.toContain("private@example.test");
  });

  it("hands the season back when the mailer refuses", async () => {
    // No postal address: the mailer refuses marketing mail.
    env({ POSTAL_ADDRESS: "PLACEHOLDER" });
    fake.rows = [{ user_id: "u1", email: "a@example.test", kind: "monthly" }];
    const out = (await (await GET(req("s3cret-value"))).json()) as Record<string, unknown>;
    expect(out).toMatchObject({ sent: 0, failed: 1 });
    expect(fake.calls).toContain("winback_release");
    expect(fake.claimed.size).toBe(0);
  });

  it("answers 500 when the list cannot be read", async () => {
    env();
    fake.failDue = true;
    expect((await GET(req("s3cret-value"))).status).toBe(500);
  });
});
