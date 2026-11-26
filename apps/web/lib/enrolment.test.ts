import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Review M3: the shared check behind /api/answers, /api/progress, /api/marks
 * and /api/then-now refuses a first-factor session when the reader has
 * turned on two-step sign-in.
 */
const ENROLMENT = "11111111-1111-4111-8111-111111111111";
const TENANT = "00000000-0000-0000-0000-00000000000a";
const fake = { session: null as null | { userId: string; email: string | null; adultConfirmedAt: string | null; mfaEnrolled: boolean }, verified: false, claimsRead: 0, rowsRead: 0 };

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getReaderSession: async () => fake.session }));
vi.mock("@/lib/mfa/role-mfa-server", () => ({
  getRoleMfaSession: async () => {
    fake.claimsRead += 1;
    return { verified: fake.verified, isStaff: false };
  },
  passkeyEnabled: async () => false,
}));
vi.mock("@/lib/tenant-id", () => ({ tenantIdForRequest: async () => TENANT }));
vi.mock("@/lib/supabase/server", () => ({
  createUserClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            fake.rowsRead += 1;
            return { data: { id: ENROLMENT, user_id: "user-1", tenant_id: TENANT, workbook_id: "w", version_id: "v" }, error: null };
          },
        }),
      }),
    }),
  }),
}));

import { requireOwnedEnrolment } from "@/lib/enrolment";

const reader = (mfaEnrolled: boolean) => ({ userId: "user-1", email: "reader@example.test", adultConfirmedAt: "2026-01-01", mfaEnrolled });

beforeEach(() => {
  fake.session = reader(false);
  fake.verified = false;
  fake.claimsRead = 0;
  fake.rowsRead = 0;
});

describe("requireOwnedEnrolment and the second factor", () => {
  it("serves a reader with no factor at the first factor, with no extra token read", async () => {
    const check = await requireOwnedEnrolment(ENROLMENT);
    expect(check.ok).toBe(true);
    expect(fake.claimsRead).toBe(0);
  });

  it("refuses a reader with a verified factor at aal1, before any row is read", async () => {
    fake.session = reader(true);
    const check = await requireOwnedEnrolment(ENROLMENT);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.response.status).toBe(403);
    const body = (await check.response.json()) as { error: string; verify: string };
    expect(body.error).toBe("second_factor_required");
    expect(body.verify).toBe("/verify?for=reader&next=%2Fhome");
    expect(check.response.headers.get("cache-control")).toBe("no-store");
    expect(fake.rowsRead).toBe(0);
  });

  it("serves a reader with a verified factor at aal2", async () => {
    fake.session = reader(true);
    fake.verified = true;
    const check = await requireOwnedEnrolment(ENROLMENT);
    expect(check.ok).toBe(true);
    expect(fake.claimsRead).toBe(1);
  });

  it("still asks a signed-out caller to sign in", async () => {
    fake.session = null;
    const check = await requireOwnedEnrolment(ENROLMENT);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.response.status).toBe(401);
  });
});
