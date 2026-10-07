/**
 * Immediate-access consent at checkout (F-096, F-097). Pure data and
 * decisions, shared by the paywall card, the two checkout routes and the
 * tests.
 *
 * Under the Consumer Contracts Regulations 2013 a reader has 14 days to
 * cancel a purchase of digital content, unless they asked for access to
 * start straight away and acknowledged that this ends the right to cancel.
 * The refund policy (docs/legal/refund-policy.md, section 1) quotes the two
 * wordings below. The reader ticks an unticked box carrying the wording
 * before they pay, and the route records which version they agreed to, and
 * when, in public.checkout_consents (migration 0019), then links it to the
 * Stripe Checkout Session.
 *
 * To change a wording: add a row to public.checkout_consent_wordings in a
 * new migration, then change the version and text here in the same release.
 * A page still showing the old version is refused with consent_changed.
 */

export type CheckoutConsentKind = "workbook" | "membership";

export interface CheckoutConsentWording {
  kind: CheckoutConsentKind;
  /** Must exist in public.checkout_consent_wordings with exactly this text. */
  version: string;
  text: string;
}

export const CHECKOUT_CONSENTS: Readonly<Record<CheckoutConsentKind, CheckoutConsentWording>> = Object.freeze({
  workbook: {
    kind: "workbook",
    version: "immediate-access-2026-10",
    text: "I want access to start right now. I understand that once access starts, I lose my 14-day right to cancel and get a refund.",
  },
  membership: {
    kind: "membership",
    version: "membership-refund-2026-10",
    text: "I want access to start right now. I understand that if I cancel within 14 days, I will get a refund minus a proportionate amount for the days I have had access.",
  },
});

export const CONSENT_REQUIRED_MESSAGE = "Please tick the box to confirm you want access to start now before you pay.";
export const CONSENT_CHANGED_MESSAGE = "The wording you are asked to confirm has changed. Please reload the page and confirm again.";

export type CheckoutConsentDecision =
  | { ok: true; kind: CheckoutConsentKind; version: string }
  | { ok: false; status: 409; error: string; code: "consent_required" | "consent_changed" };

/**
 * May a checkout go ahead on the consent the page showed? The client sends
 * the version of the wording the reader ticked. Missing means they did not
 * tick it; a different version means the page is out of date.
 */
export function checkoutConsentDecision(kind: CheckoutConsentKind, sent: string | null | undefined): CheckoutConsentDecision {
  const current = CHECKOUT_CONSENTS[kind].version;
  if (!sent) return { ok: false, status: 409, error: CONSENT_REQUIRED_MESSAGE, code: "consent_required" };
  if (sent !== current) return { ok: false, status: 409, error: CONSENT_CHANGED_MESSAGE, code: "consent_changed" };
  return { ok: true, kind, version: current };
}

/** The line on Stripe's page above the pay button for a single workbook. */
export const WORKBOOK_SUBMIT_NOTICE =
  "You asked for access to start as soon as you pay. Once it starts, the 14-day right to cancel and get a refund no longer applies.";

/** Stripe metadata for a recorded consent. Ids and versions only. */
export function consentMetadata(id: number | string, version: string): Record<string, string> {
  return { consent_id: String(id), consent_version: version };
}
