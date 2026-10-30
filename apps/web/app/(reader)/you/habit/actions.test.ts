import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Save pace" on /you/habit over a fake client: the update names one
 * enrolment and the signed-in reader, and nothing else. The signed-in test
 * found the old form wrote the chosen pace to every enrolment.
 */

const USER = "f49da904-3ada-4e90-b89f-0e3b7974b6b7";
const ENROLMENT = "a6900000-0000-0000-0000-0000000000e1";

const fake = {
  calls: [] as { table: string; update: Record<string, unknown>; filters: [string, unknown][] }[],
  rows: [{ id: ENROLMENT }] as { id: string }[],
};

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createUserClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
    from: (table: string) => ({
      update: (update: Record<string, unknown>) => {
        const call = { table, update, filters: [] as [string, unknown][] };
        fake.calls.push(call);
        const q = {
          eq: (col: string, val: unknown) => {
            call.filters.push([col, val]);
            return q;
          },
          select: async () => ({ data: fake.rows, error: null }),
        };
        return q;
      },
    }),
  }),
}));

const { savePace } = await import("@/app/(reader)/you/habit/actions");

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe("savePace", () => {
  beforeEach(() => {
    fake.calls = [];
    fake.rows = [{ id: ENROLMENT }];
  });

  it("updates only the enrolment the form is for, and only the reader's own", async () => {
    await expect(savePace(form({ enrolment_id: ENROLMENT, pace: "daily" }))).rejects.toThrow("redirect:/you/habit?notice=saved");
    expect(fake.calls).toEqual([
      {
        table: "enrolments",
        update: { pace: "daily" },
        filters: [
          ["id", ENROLMENT],
          ["user_id", USER],
        ],
      },
    ]);
  });

  it("writes nothing without a well formed enrolment id", async () => {
    await expect(savePace(form({ pace: "daily" }))).rejects.toThrow("notice=invalid");
    await expect(savePace(form({ "pace:abc": "daily", pace: "weekly" }))).rejects.toThrow("notice=invalid");
    expect(fake.calls).toEqual([]);
  });

  it("reports a failure when no row of the reader's matched", async () => {
    fake.rows = [];
    await expect(savePace(form({ enrolment_id: ENROLMENT, pace: "weekly" }))).rejects.toThrow("notice=failed");
  });
});
