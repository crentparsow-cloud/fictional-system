import { describe, expect, it } from "vitest";
import { accountStatusLine, dashAbilities, lookupErrorMessage, parseLookupInput, readLookup } from "./account-lookup";

describe("dashAbilities", () => {
  it("mirrors the 0022 role checks", () => {
    expect(dashAbilities(["support"])).toEqual({ lookupAccounts: true, readTakedowns: true, decideTakedowns: false });
    expect(dashAbilities(["editor"])).toEqual({ lookupAccounts: true, readTakedowns: true, decideTakedowns: true });
    expect(dashAbilities(["finance"])).toEqual({ lookupAccounts: false, readTakedowns: false, decideTakedowns: false });
    expect(dashAbilities(["safety_reviewer"]).lookupAccounts).toBe(false);
    expect(dashAbilities(["made_up"]).lookupAccounts).toBe(false);
    expect(dashAbilities(null).readTakedowns).toBe(false);
  });
});

describe("parseLookupInput", () => {
  it("cleans the email and needs a reason", () => {
    expect(parseLookupInput("  Reader@Example.COM ", "Ticket 41")).toEqual({ ok: true, email: "reader@example.com", reason: "Ticket 41" });
    expect(parseLookupInput("nope", "Ticket 41")).toMatchObject({ ok: false, field: "email" });
    expect(parseLookupInput("a@b.co", "hi")).toMatchObject({ ok: false, field: "reason" });
    expect(parseLookupInput("a@b.co", "x".repeat(501))).toMatchObject({ ok: false, field: "reason" });
  });
});

describe("readLookup", () => {
  it("reads a found account and drops anything unexpected", () => {
    const r = readLookup({
      found: true,
      user: { id: "u1", email: "r@example.com", created_at: "2026-10-01T00:00:00Z", last_sign_in_at: null, staff: false },
      profile: { country: "GB" },
      consents: { health_at: "2026-10-02T00:00:00Z", health_version: "health-2026-10" },
      terms: [{ doc: "reader_terms", version: "v1", context: "signup", was_draft: true, accepted_at: "2026-10-01T00:00:00Z" }],
      deletion: { state: "pending", requested_at: "2026-10-05T00:00:00Z", cancel_before: "2026-10-12T00:00:00Z" },
      purchases: [{ id: "p1", kind: "workbook", workbook_code: "AK-1A2B3", currency: "GBP", amount_minor: 999, tax_minor: 167, status: "paid" }],
      subscriptions: [],
      entitlements: [{ workbook_code: null, source: "membership", status: "active" }],
      lookups: [{ at: "2026-10-07T00:00:00Z", actor_role: "support", reason: "Ticket 41" }],
      answers: [{ secret: "never" }],
    });
    expect(r.found).toBe(true);
    expect(r.user?.email).toBe("r@example.com");
    expect(r.purchases[0]).toMatchObject({ workbookCode: "AK-1A2B3", amountMinor: 999 });
    expect(r.deletion?.state).toBe("pending");
    expect(r.entitlements[0]!.workbookCode).toBeNull();
    expect(JSON.stringify(r)).not.toContain("never");
    expect(accountStatusLine(r)).toMatch(/Deletion requested/);
  });
  it("treats anything else as not found", () => {
    expect(readLookup(null).found).toBe(false);
    expect(readLookup({ found: false }).found).toBe(false);
    expect(readLookup("x").purchases).toEqual([]);
    expect(accountStatusLine(readLookup(null))).toMatch(/No account/);
  });
  it("reports a block", () => {
    const r = readLookup({ found: true, user: { id: "u", email: "e@x.io", banned_until: "2099-01-01T00:00:00Z", email_confirmed_at: "2026-01-01T00:00:00Z" } });
    expect(accountStatusLine(r, new Date("2026-10-07T00:00:00Z"))).toBe("Blocked from signing in.");
  });
});

describe("lookupErrorMessage", () => {
  it("maps codes", () => {
    expect(lookupErrorMessage("AKD29")).toMatch(/sixty/);
    expect(lookupErrorMessage("AKD01")).toMatch(/role/);
    expect(lookupErrorMessage(null)).toMatch(/did not run/);
  });
});
