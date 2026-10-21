import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GET /api/money/payout-run over fakes: the daily cron acts on the weekday
 * when royalty_config says weekly and on payout_day when it says monthly.
 */

const state = {
  config: null as Record<string, unknown> | null,
  runs: 0,
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => ({ transfers: { create: async () => ({ id: "tr_1" }) } }) }));
vi.mock("@/lib/ops-alerts", () => ({ reportOps: async () => undefined }));
vi.mock("@/lib/money/db", () => ({
  currentConfig: async () => state.config,
  payoutStore: () => ({
    startRun: async () => {
      state.runs += 1;
      return "run-1";
    },
    pending: async () => [],
    complete: async () => undefined,
    fail: async () => undefined,
    finish: async () => undefined,
  }),
}));

import { GET } from "./route";

function call() {
  return GET(new NextRequest("https://akana.test/api/money/payout-run", { headers: { authorization: "Bearer cron-secret" } }));
}

describe("payout run calendar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("CRON_SECRET", "cron-secret");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    state.runs = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("runs on the configured weekday when weekly", async () => {
    state.config = { payout_cadence: "weekly", payout_weekday: 5, payout_day: 15 };
    vi.setSystemTime(new Date("2026-10-16T08:00:00Z")); // a Friday
    const body = await (await call()).json();
    expect(body).toMatchObject({ run_id: "run-1" });
    expect(state.runs).toBe(1);
  });

  it("skips the other days when weekly, even the 15th", async () => {
    state.config = { payout_cadence: "weekly", payout_weekday: 5, payout_day: 15 };
    vi.setSystemTime(new Date("2026-10-15T08:00:00Z")); // a Thursday, and the 15th
    const body = await (await call()).json();
    expect(body).toMatchObject({ skipped: "not_payout_day", cadence: "weekly" });
    expect(state.runs).toBe(0);
  });

  it("keeps the monthly path: runs on payout_day, skips a Friday that is not", async () => {
    state.config = { payout_cadence: "monthly", payout_weekday: 5, payout_day: 15 };
    vi.setSystemTime(new Date("2026-10-15T08:00:00Z"));
    expect(await (await call()).json()).toMatchObject({ run_id: "run-1" });
    expect(state.runs).toBe(1);
    vi.setSystemTime(new Date("2026-10-16T08:00:00Z"));
    expect(await (await call()).json()).toMatchObject({ skipped: "not_payout_day", cadence: "monthly" });
    expect(state.runs).toBe(1);
  });

  it("stays locked to a test key", async () => {
    state.config = { payout_cadence: "weekly", payout_weekday: 5, payout_day: 15 };
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_123");
    vi.setSystemTime(new Date("2026-10-16T08:00:00Z"));
    expect(await (await call()).json()).toEqual({ skipped: "live_mode_locked" });
    expect(state.runs).toBe(0);
  });
});
