import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CHECKOUT_CONSENTS,
  CONSENT_CHANGED_MESSAGE,
  CONSENT_REQUIRED_MESSAGE,
  WORKBOOK_SUBMIT_NOTICE,
  checkoutConsentDecision,
  consentMetadata,
} from "./checkout-consent";

const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const policy = readFileSync(root("docs/legal/refund-policy.md"), "utf8");
const migration = readFileSync(root("supabase/migrations/0019_checkout_consent.sql"), "utf8");

describe("checkout consent wordings", () => {
  it("quote the refund policy word for word", () => {
    for (const c of Object.values(CHECKOUT_CONSENTS)) expect(policy).toContain(`"${c.text}"`);
  });

  it("are seeded in migration 0019 with the same version and text", () => {
    for (const c of Object.values(CHECKOUT_CONSENTS)) {
      expect(migration).toContain(`('${c.kind}', '${c.version}',\n   '${c.text.replace(/'/g, "''")}'`);
    }
  });

  it("say the workbook consent ends the right to cancel and the membership one gives a pro rata refund", () => {
    expect(CHECKOUT_CONSENTS.workbook.text).toMatch(/lose my 14-day right to cancel/);
    expect(CHECKOUT_CONSENTS.membership.text).toMatch(/within 14 days.*refund minus a proportionate amount/);
  });

  it("use plain copy: no em dashes", () => {
    for (const t of [...Object.values(CHECKOUT_CONSENTS).map((c) => c.text), CONSENT_REQUIRED_MESSAGE, CONSENT_CHANGED_MESSAGE, WORKBOOK_SUBMIT_NOTICE]) {
      expect(t).not.toMatch(/—/);
    }
  });
});

describe("checkoutConsentDecision", () => {
  it("refuses a checkout with no consent", () => {
    expect(checkoutConsentDecision("workbook", undefined)).toEqual({ ok: false, status: 409, error: CONSENT_REQUIRED_MESSAGE, code: "consent_required" });
    expect(checkoutConsentDecision("membership", "")).toMatchObject({ ok: false, code: "consent_required" });
  });

  it("refuses an out of date or wrong-kind version", () => {
    expect(checkoutConsentDecision("workbook", "immediate-access-1999-01")).toEqual({
      ok: false,
      status: 409,
      error: CONSENT_CHANGED_MESSAGE,
      code: "consent_changed",
    });
    expect(checkoutConsentDecision("workbook", CHECKOUT_CONSENTS.membership.version)).toMatchObject({ ok: false, code: "consent_changed" });
    expect(checkoutConsentDecision("membership", CHECKOUT_CONSENTS.workbook.version)).toMatchObject({ ok: false, code: "consent_changed" });
  });

  it("lets the current version through", () => {
    expect(checkoutConsentDecision("workbook", CHECKOUT_CONSENTS.workbook.version)).toEqual({
      ok: true,
      kind: "workbook",
      version: CHECKOUT_CONSENTS.workbook.version,
    });
    expect(checkoutConsentDecision("membership", CHECKOUT_CONSENTS.membership.version)).toMatchObject({ ok: true, kind: "membership" });
  });

  it("puts ids and versions only in Stripe metadata", () => {
    expect(consentMetadata(42, "immediate-access-2026-10")).toEqual({ consent_id: "42", consent_version: "immediate-access-2026-10" });
  });
});
