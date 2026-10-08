import { describe, expect, it } from "vitest";
import { renderReader } from "@akana/emails";
import { canRestoreRow, readLookup } from "@/lib/account-lookup";
import {
  parseCancelDeletion,
  parseResend,
  parseRestore,
  readResendContext,
  readerBase,
  refundProps,
  resendProps,
  supportAbilities,
  supportErrorMessage,
} from "@/lib/support-actions";

const U = "a2700000-0000-0000-0000-000000000005";
const P = "a2700000-0000-0000-0000-000000000902";
const form = (o: Record<string, string>) => (k: string) => o[k] ?? null;

describe("lookup action abilities (F-087)", () => {
  it("mirror the 0021 and 0027 roles", () => {
    expect(supportAbilities(["owner"])).toEqual({ refund: true, resend: true, restore: true, cancelDeletion: true });
    expect(supportAbilities(["support"])).toEqual({ refund: false, resend: true, restore: true, cancelDeletion: true });
    expect(supportAbilities(["editor"])).toEqual({ refund: false, resend: true, restore: false, cancelDeletion: false });
    // finance refunds from Money, Refunds: it cannot open the lookup at all
    expect(supportAbilities(["finance"])).toEqual({ refund: false, resend: false, restore: false, cancelDeletion: false });
    expect(supportAbilities(["safety_reviewer", "nonsense"])).toEqual({ refund: false, resend: false, restore: false, cancelDeletion: false });
  });
});

describe("lookup action inputs", () => {
  it("need a reason of 5 to 500 characters", () => {
    expect(parseResend(form({ user: U, kind: "purchase", ref: P, reason: "abc" })).ok).toBe(false);
    expect(parseResend(form({ user: U, kind: "purchase", ref: P, reason: "x".repeat(501) })).ok).toBe(false);
    const ok = parseResend(form({ user: U, kind: "purchase", ref: P.toUpperCase(), reason: "  Ticket 42\u0007 " }));
    expect(ok).toEqual({ ok: true, value: { userId: U, kind: "purchase", ref: P, reason: "Ticket 42" } });
  });

  it("check the reference matches the kind", () => {
    expect(parseResend(form({ user: U, kind: "membership", ref: P, reason: "Ticket 42" })).ok).toBe(false);
    expect(parseResend(form({ user: U, kind: "membership", ref: "sub_123abc", reason: "Ticket 42" })).ok).toBe(true);
    expect(parseResend(form({ user: "x", kind: "purchase", ref: P, reason: "Ticket 42" })).ok).toBe(false);
  });

  it("restore takes a row or a code, never both, and an end date only for a grant", () => {
    const now = new Date("2026-10-08T12:00:00Z");
    expect(parseRestore(form({ user: U, reason: "Ticket 42" }), now).ok).toBe(false);
    expect(parseRestore(form({ user: U, entitlement: P, workbook_code: "AK-T27A0", reason: "Ticket 42" }), now).ok).toBe(false);
    expect(parseRestore(form({ user: U, entitlement: P, ends_on: "2026-12-01", reason: "Ticket 42" }), now).ok).toBe(false);
    expect(parseRestore(form({ user: U, workbook_code: "AK-12", reason: "Ticket 42" }), now).ok).toBe(false);
    expect(parseRestore(form({ user: U, workbook_code: "ak-t27a0", ends_on: "2026-10-01", reason: "Ticket 42" }), now).ok).toBe(false);
    expect(parseRestore(form({ user: U, workbook_code: "ak-t27a0", ends_on: "2029-10-01", reason: "Ticket 42" }), now).ok).toBe(false);
    const g = parseRestore(form({ user: U, workbook_code: "ak-t27a0", ends_on: "2026-12-01", reason: "Ticket 42" }), now);
    expect(g).toEqual({ ok: true, value: { userId: U, entitlementId: null, workbookCode: "AK-T27A0", endsAt: "2026-12-01T23:59:59.000Z", reason: "Ticket 42" } });
    const e = parseRestore(form({ user: U, entitlement: P, reason: "Ticket 42" }), now);
    expect(e.ok && e.value.entitlementId).toBe(P);
  });

  it("cancel needs the confirmation box", () => {
    expect(parseCancelDeletion(form({ user: U, reason: "Ticket 42" })).ok).toBe(false);
    expect(parseCancelDeletion(form({ user: U, reason: "Ticket 42", confirm: "yes" })).ok).toBe(true);
  });

  it("map the 0027 codes to plain words", () => {
    expect(supportErrorMessage("AKX01")).toMatch(/role/);
    expect(supportErrorMessage("AKX29")).toMatch(/limit/);
    expect(supportErrorMessage("whatever")).toMatch(/did not run/);
  });
});

describe("restorable rows", () => {
  const r = readLookup({
    found: true,
    user: { id: U, email: "r@example.test" },
    entitlements: [
      { id: "e1", workbook_code: "AK-T27A0", source: "purchase", status: "revoked" },
      { id: "e2", workbook_code: null, source: "membership", status: "lapsed" },
      { id: "e3", workbook_code: "AK-T27A0", source: "gift", status: "active", ends_at: "2020-01-01T00:00:00Z" },
      { id: "e4", workbook_code: "AK-T27A0", source: "purchase", status: "active" },
      { id: "e5", workbook_code: "AK-T27B0", source: "purchase", status: "revoked", taken_down: true },
      { workbook_code: "AK-T27A0", source: "purchase", status: "revoked" },
    ],
    deletion: { state: "pending", can_cancel: true },
    actions: [{ action: "account.access_restored", reason: "Ticket 1" }],
  });
  it("are revoked, lapsed or ended purchase and gift rows not under a takedown", () => {
    expect(r.entitlements.map((e) => canRestoreRow(e))).toEqual([true, false, true, false, false, false]);
    expect(r.deletion?.canCancel).toBe(true);
    expect(r.actions[0]!.action).toBe("account.access_restored");
  });
});

describe("support emails", () => {
  const base = readerBase("https://akana.test", "help@akana.test", "Rae Reader");
  it("refund email carries the amount and no title", () => {
    const props = refundProps(base, 999, "GBP", true)!;
    const out = renderReader("refund_confirmed", props);
    expect(out.text).toContain("£9.99");
    expect(out.text).toContain("Hi Rae,");
    expect(refundProps(base, 999, "XXXX", true)).toBeNull();
  });

  it("resend builds the purchase or membership confirmation from the 0027 context", () => {
    const p = readResendContext({ kind: "purchase", email: "r@example.test", amount_minor: 1299, currency: "GBP" })!;
    const made = resendProps(p, base)!;
    expect(made.template).toBe("purchase_lifetime");
    const m = readResendContext({ kind: "membership", email: "r@example.test", amount_minor: "799", currency: "GBP", plan: "member_month", current_period_end: "2026-11-06T10:00:00Z" })!;
    const mm = resendProps(m, base)!;
    expect(mm.template).toBe("purchase_membership");
    if (mm.template === "purchase_membership") expect(mm.props).toMatchObject({ price: "£7.99", periodWords: "a month", nextDate: "6 November 2026" });
    expect(resendProps({ ...m, currentPeriodEnd: null }, base)).toBeNull();
    expect(readResendContext({ kind: "purchase" })).toBeNull();
  });
});
