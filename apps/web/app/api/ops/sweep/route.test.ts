import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The nightly sweep over a fake service role client: the retention prune
 * (review finding M21, migration 0076) runs with the others, its counts come
 * back as counts only, and a failure is reported.
 */
const fake = {
  calls: [] as string[],
  reports: [] as string[],
  retention: { data: { leads: 2, support_messages: 1, audit_log: 0, note: "not a count" } as unknown, error: null as null | { code: string } },
  async rpc(name: string) {
    this.calls.push(name);
    if (name === "prune_retention") return this.retention;
    return { data: 3, error: null };
  },
};

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: (name: string) => fake.rpc(name) }) }));
vi.mock("@/lib/ops-alerts", () => ({
  reportOps: async (_admin: unknown, kind: string, source: string, code: string) => {
    fake.reports.push(`${kind}:${source}:${code}`);
  },
}));

const request = (secret?: string) => new NextRequest("https://akana.test/api/ops/sweep", { headers: secret ? { authorization: `Bearer ${secret}` } : {} });

describe("the nightly sweep", () => {
  beforeEach(() => {
    fake.calls = [];
    fake.reports = [];
    fake.retention = { data: { leads: 2, support_messages: 1, audit_log: 0, note: "not a count" }, error: null };
    vi.stubEnv("CRON_SECRET", "cron-secret");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("does nothing without the cron secret", async () => {
    const { GET } = await import("./route");
    expect((await GET(request())).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request("cron-secret"))).status).toBe(503);
    expect(fake.calls).toEqual([]);
  });

  it("runs the retention prune with the other prunes and returns counts only", async () => {
    const { GET } = await import("./route");
    const res = await GET(request("cron-secret"));
    expect(res.status).toBe(200);
    expect(fake.calls).toEqual(["prune_funnel_counts", "prune_funnel_visitors", "prune_ops_events", "prune_rate_hits", "org_offboard_sweep", "prune_retention"]);
    const body = await res.json();
    expect(body.retention).toEqual({ leads: 2, support_messages: 1, audit_log: 0 });
    expect(body.funnel_pruned).toBe(3);
  });

  it("reports a failed retention prune as a cron failure", async () => {
    fake.retention = { data: null, error: { code: "42501" } };
    const { GET } = await import("./route");
    const res = await GET(request("cron-secret"));
    expect(res.status).toBe(500);
    expect(fake.reports).toEqual(["cron_failure:api/ops/sweep:42501"]);
  });
});
