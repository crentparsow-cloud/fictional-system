import { describe, expect, it } from "vitest";
import {
  CONSENT_REQUIRED_MESSAGE,
  FAITH_CONSENT_REQUIRED_MESSAGE,
  FAITH_CONSENT_VERSION,
  FAITH_SHELF_ID,
  HEALTH_CONSENT_VERSION,
  answerWriteDecision,
  consentGate,
  consentHref,
  faithAnswerWriteDecision,
  faithConsentGate,
  faithConsentHref,
  hasCurrentConsent,
  isFaithWorkbook,
} from "./consent";

const AT = "2026-10-07T09:00:00.000Z";
const V = HEALTH_CONSENT_VERSION;

describe("consentGate (F-026)", () => {
  it("never asks for tier none", () => {
    expect(consentGate("none", { consentAt: null, consentVersion: null })).toBe("open");
    expect(consentGate("none", { consentAt: AT, consentVersion: V })).toBe("open");
  });

  it("asks for standard and higher until consent is given", () => {
    expect(consentGate("standard", { consentAt: null, consentVersion: null })).toBe("consent");
    expect(consentGate("higher", { consentAt: undefined, consentVersion: undefined })).toBe("consent");
    expect(consentGate("standard", { consentAt: AT, consentVersion: V })).toBe("open");
    expect(consentGate("higher", { consentAt: AT, consentVersion: V })).toBe("open");
  });

  it("treats an unknown or unread tier as wellbeing", () => {
    expect(consentGate(null, { consentAt: null, consentVersion: null })).toBe("consent");
    expect(consentGate("something", { consentAt: null, consentVersion: null })).toBe("consent");
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
    expect(answerWriteDecision("none", { consentAt: null, consentVersion: null })).toEqual({ ok: true });
  });

  it("allows saves for wellbeing tiers with consent", () => {
    expect(answerWriteDecision("standard", { consentAt: AT, consentVersion: V })).toEqual({ ok: true });
    expect(answerWriteDecision("higher", { consentAt: AT, consentVersion: V })).toEqual({ ok: true });
  });

  it("refuses with 403 and a plain message after withdrawal", () => {
    expect(answerWriteDecision("standard", { consentAt: null, consentVersion: null })).toEqual({
      ok: false,
      status: 403,
      error: "consent_required",
      message: CONSENT_REQUIRED_MESSAGE,
    });
    expect(answerWriteDecision("higher", { consentAt: null, consentVersion: null }).ok).toBe(false);
  });

  it("fails closed when the tier could not be read", () => {
    expect(answerWriteDecision(null, { consentAt: null, consentVersion: null }).ok).toBe(false);
  });
});

describe("consent to an older wording (new version re-ask)", () => {
  const old = { consentAt: AT, consentVersion: "health-2026-09" };

  it("counts consent only when it matches the current version", () => {
    expect(HEALTH_CONSENT_VERSION).toBe("health-2026-10");
    expect(hasCurrentConsent({ consentAt: AT, consentVersion: V })).toBe(true);
    expect(hasCurrentConsent(old)).toBe(false);
    expect(hasCurrentConsent({ consentAt: AT, consentVersion: null })).toBe(false);
    expect(hasCurrentConsent({ consentAt: AT, consentVersion: undefined })).toBe(false);
    expect(hasCurrentConsent({ consentAt: null, consentVersion: V })).toBe(false);
  });

  it("sends a reader who agreed to an older wording back to the consent screen", () => {
    expect(consentGate("standard", old)).toBe("consent");
    expect(consentGate("higher", old)).toBe("consent");
    expect(consentGate("none", old)).toBe("open");
  });

  it("refuses new answers in a wellbeing workbook until the current wording is agreed", () => {
    expect(answerWriteDecision("standard", old)).toEqual({
      ok: false,
      status: 403,
      error: "consent_required",
      message: CONSENT_REQUIRED_MESSAGE,
    });
    expect(answerWriteDecision("none", old)).toEqual({ ok: true });
  });

  it("checks against a given version when one is passed", () => {
    expect(hasCurrentConsent(old, "health-2026-09")).toBe(true);
    expect(hasCurrentConsent({ consentAt: AT, consentVersion: V }, "health-2027-01")).toBe(false);
  });
});

describe("faith consent (F-150)", () => {
  const FV = FAITH_CONSENT_VERSION;
  const faith = { shelfId: FAITH_SHELF_ID, genreId: "education" };
  const other = { shelfId: "personal-growth", genreId: "personal_development" };

  it("keys on the Faith and Spirituality shelf, or a future faith genre", () => {
    expect(isFaithWorkbook(faith)).toBe(true);
    expect(isFaithWorkbook({ shelfId: null, genreId: "faith" })).toBe(true);
    expect(isFaithWorkbook(other)).toBe(false);
    expect(isFaithWorkbook({ shelfId: undefined, genreId: undefined })).toBe(false);
  });

  it("uses its own version, in the pattern the migration accepts", () => {
    expect(FV).toBe("faith-2026-10");
    expect(FV).toMatch(/^[a-z0-9][a-z0-9._-]{0,31}$/);
    expect(FV).not.toBe(HEALTH_CONSENT_VERSION);
  });

  it("asks before a faith workbook and never for others", () => {
    expect(faithConsentGate(faith, { consentAt: null, consentVersion: null })).toBe("faith-consent");
    expect(faithConsentGate(faith, { consentAt: AT, consentVersion: FV })).toBe("open");
    expect(faithConsentGate(other, { consentAt: null, consentVersion: null })).toBe("open");
  });

  it("does not accept the health consent version as faith consent", () => {
    expect(faithConsentGate(faith, { consentAt: AT, consentVersion: HEALTH_CONSENT_VERSION })).toBe("faith-consent");
    expect(faithConsentGate(faith, { consentAt: AT, consentVersion: "faith-2026-09" })).toBe("faith-consent");
  });

  it("refuses new answers in a faith workbook after withdrawal", () => {
    expect(faithAnswerWriteDecision(faith, { consentAt: null, consentVersion: null })).toEqual({
      ok: false,
      status: 403,
      error: "consent_required",
      message: FAITH_CONSENT_REQUIRED_MESSAGE,
    });
    expect(faithAnswerWriteDecision(faith, { consentAt: AT, consentVersion: FV })).toEqual({ ok: true });
    expect(faithAnswerWriteDecision(other, { consentAt: null, consentVersion: null })).toEqual({ ok: true });
  });

  it("builds the faith consent URL with the path encoded", () => {
    expect(faithConsentHref("/read/x")).toBe("/consent/faith?next=%2Fread%2Fx");
  });
});
