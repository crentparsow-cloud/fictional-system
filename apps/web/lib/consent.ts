/**
 * Health data consent (F-026) and the rules that hang off it. Pure
 * functions only, so the page, the answers route and the tests share one
 * decision.
 *
 * A workbook whose safety tier is standard or higher is a wellbeing
 * workbook: what a reader writes in it may be health data. Before one opens,
 * the reader gives explicit consent, recorded on their profile by
 * app.set_health_consent (migration 0006) with the version below. Tier none
 * never asks.
 */

export type SafetyTier = "none" | "standard" | "higher";

/**
 * The wording version the consent screen shows. Change it whenever the
 * consent text changes in a way that matters, so the record says which
 * words the reader agreed to. Must match the pattern in migration 0006.
 */
export const HEALTH_CONSENT_VERSION = "health-2026-10";

export interface ConsentState {
  /** profiles.health_consent_at, or null when never given or withdrawn. */
  consentAt: string | null | undefined;
  /**
   * profiles.health_consent_version. Consent given to an older wording is
   * treated as missing, so the reader is asked again after the version
   * changes.
   */
  consentVersion: string | null | undefined;
}

/** Consent is in place only when it was given to the current wording. */
export function hasCurrentConsent(consent: ConsentState, current: string = HEALTH_CONSENT_VERSION): boolean {
  return Boolean(consent.consentAt) && consent.consentVersion === current;
}

/** A tier we do not recognise, or one we could not read, is treated as wellbeing. */
export function isWellbeingTier(tier: string | null | undefined): boolean {
  return tier !== "none";
}

/**
 * Where a reader goes when they open a workbook: the consent screen first,
 * or straight in.
 */
export function consentGate(tier: string | null | undefined, consent: ConsentState): "consent" | "open" {
  if (!isWellbeingTier(tier)) return "open";
  return hasCurrentConsent(consent) ? "open" : "consent";
}

export const CONSENT_REQUIRED_MESSAGE =
  "Your answers in this workbook are not being saved, because consent to store them is not in place. You can give it again in You.";

export type AnswerWriteDecision = { ok: true } | { ok: false; status: 403; error: "consent_required"; message: string };

/**
 * May the answers route save a value for this workbook? Withdrawal stops new
 * saves for wellbeing workbooks, as does consent given to an older wording
 * until the reader agrees to the current one. Reading what is already there
 * is not affected. A tier that could not be read fails closed.
 */
export function answerWriteDecision(tier: string | null | undefined, consent: ConsentState): AnswerWriteDecision {
  if (consentGate(tier, consent) === "open") return { ok: true };
  return { ok: false, status: 403, error: "consent_required", message: CONSENT_REQUIRED_MESSAGE };
}

/** The consent screen URL for a path the reader was heading to. */
export function consentHref(next: string): string {
  return `/consent?next=${encodeURIComponent(next)}`;
}
