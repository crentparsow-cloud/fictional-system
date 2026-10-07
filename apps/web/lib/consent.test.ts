import { describe, expect, it } from "vitest";
import { CONSENT_REQUIRED_MESSAGE, HEALTH_CONSENT_VERSION, answerWriteDecision, consentGate, consentHref } from "./consent";

const AT = "2026-10-07T09:00:00.000Z";

describe("consentGate (F-026)", () => {
  it("never asks for tier none", () => {
    expect(consentGate("none", { consentAt: null })).toBe("open");
    expect(consentGate("none", { consentAt: AT })).toBe("open");
  });

  it("asks for standard and higher until consent is given", () => {
    expect(consentGate("standard", { consentAt: null })).toBe("consent");
    expect(consentGate("higher", { consentAt: undefined })).toBe("consent");
    expect(consentGate("standard", { consentAt: AT })).toBe("open");
    expect(consentGate("higher", { consentAt: AT })).toBe("open");
  });

  it("treats an unknown or unread tier as wellbeing", () => {
    expect(consentGate(null, { consentAt: null })).toBe("consent");
    expect(consentGate("something", { consentAt: null })).toBe("consent");
  });

  it("builds the consent URL with the path encoded", () => {
    expect(consentHref("/read/the-ten-minute-pause")).toBe("/consent?next=%2Fread%2Fthe-ten-minute-pause");
  });

  it("uses a version the migration accepts", () => {
    expect(HEALTH_CONSENT_VERSION).toMatch(/^[a-z0-9][a-z0-9._-]{0,31}$/);
  });
});

describe("answerWriteDecision (PUT /api/answers)", () => {
  it("allows saves for tier none with or without consent", () => {
    expect(answerWriteDecision("none", { consentAt: null })).toEqual({ ok: true });
  });

  it("allows saves for wellbeing tiers with consent", () => {
    expect(answerWriteDecision("standard", { consentAt: AT })).toEqual({ ok: true });
    expect(answerWriteDecision("higher", { consentAt: AT })).toEqual({ ok: true });
  });

  it("refuses with 403 and a plain message after withdrawal", () => {
    expect(answerWriteDecision("standard", { consentAt: null })).toEqual({
      ok: false,
      status: 403,
      error: "consent_required",
      message: CONSENT_REQUIRED_MESSAGE,
    });
    expect(answerWriteDecision("higher", { consentAt: null }).ok).toBe(false);
  });

  it("fails closed when the tier could not be read", () => {
    expect(answerWriteDecision(null, { consentAt: null }).ok).toBe(false);
  });
});
