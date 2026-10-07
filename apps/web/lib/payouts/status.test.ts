import { describe, expect, it } from "vitest";
import {
  PAYOUT_STATUS_COPY,
  SELF_SERVE_PAYOUT_COUNTRIES,
  accountCreateParams,
  connectStatusFromAccount,
  isSelfServePayoutCountry,
  onboardingUrls,
  payoutErrorMessage,
  serviceAgreementFor,
} from "@/lib/payouts/status";

type Acc = Parameters<typeof connectStatusFromAccount>[0];
const acc = (o: Partial<{ details_submitted: boolean; payouts_enabled: boolean; transfers: string; past_due: string[]; disabled: string | null }>): Acc =>
  ({
    details_submitted: o.details_submitted ?? true,
    payouts_enabled: o.payouts_enabled ?? false,
    capabilities: o.transfers ? { transfers: o.transfers } : {},
    requirements: { past_due: o.past_due ?? [], disabled_reason: o.disabled ?? null },
  }) as unknown as Acc;

describe("connectStatusFromAccount", () => {
  it("is verified only with active transfers and payouts enabled", () => {
    expect(connectStatusFromAccount(acc({ transfers: "active", payouts_enabled: true }))).toBe("verified");
    expect(connectStatusFromAccount(acc({ transfers: "active", payouts_enabled: false }))).toBe("pending");
  });
  it("needs action when onboarding is unfinished or something is past due", () => {
    expect(connectStatusFromAccount(acc({ details_submitted: false }))).toBe("action_needed");
    expect(connectStatusFromAccount(acc({ past_due: ["external_account"] }))).toBe("action_needed");
    expect(connectStatusFromAccount(acc({ transfers: "active", payouts_enabled: true, past_due: ["x"] }))).toBe("action_needed");
    expect(connectStatusFromAccount(acc({ disabled: "requirements.past_due" }))).toBe("action_needed");
  });
  it("is pending while Stripe checks", () => {
    expect(connectStatusFromAccount(acc({ transfers: "pending", disabled: "requirements.pending_verification" }))).toBe("pending");
  });
});

describe("countries and agreements", () => {
  it("covers the UK, EEA, US, Canada and Switzerland and nobody else", () => {
    for (const c of ["GB", "IE", "DE", "NO", "US", "CA", "CH", "gb"]) expect(isSelfServePayoutCountry(c)).toBe(true);
    for (const c of ["IN", "NG", "BR", "AU", "", null]) expect(isSelfServePayoutCountry(c)).toBe(false);
    expect(SELF_SERVE_PAYOUT_COUNTRIES).toHaveLength(34);
  });
  it("uses the recipient agreement across borders", () => {
    expect(serviceAgreementFor("GB")).toBe("full");
    expect(serviceAgreementFor("FR")).toBe("recipient");
  });
  it("creates an Express account with transfers only and no personal data in metadata", () => {
    const p = accountCreateParams({ orgId: "o1", kind: "individual", country: "ie" });
    expect(p.country).toBe("IE");
    expect(p.business_type).toBe("individual");
    expect(p.controller?.stripe_dashboard?.type).toBe("express");
    expect(p.capabilities).toEqual({ transfers: { requested: true } });
    expect(p.metadata).toEqual({ akana_org_id: "o1" });
    expect(accountCreateParams({ orgId: "o2", kind: "publisher", country: "GB" }).business_type).toBe("company");
  });
});

describe("copy", () => {
  it("has return and refresh URLs on /payouts", () => {
    expect(onboardingUrls("https://akana.test", "abc")).toEqual({
      return_url: "https://akana.test/payouts/return?org=abc",
      refresh_url: "https://akana.test/payouts/refresh?org=abc",
    });
  });
  it("uses no em dashes", () => {
    const all = [...Object.values(PAYOUT_STATUS_COPY).flatMap((c) => [c.label, c.detail]), ...["AKY01", "AKY02", "AKY03", "AKY04", "AKY29", "x"].map(payoutErrorMessage)];
    for (const s of all) expect(s).not.toContain("—");
  });
});
