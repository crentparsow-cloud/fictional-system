/**
 * Versioned terms acceptance (F-122). Pure functions only, so the pages, the
 * checkout routes and the tests share one decision. Built like the health
 * consent re-ask in lib/consent.ts.
 *
 * The reader terms are docs/legal/reader-terms.md, with the refund policy
 * and the privacy notice they point to. Each wording has a version. Every
 * time a reader accepts one, a row goes into public.terms_acceptances
 * through public.accept_terms (migration 0018): at sign-up, at checkout,
 * and when they are asked again after the wording changes.
 *
 * To change the wording: add the new version to public.terms_versions
 * (public.publish_terms_version, platform owner only), then change
 * READER_TERMS_VERSION below in the same release. Every reader is then
 * asked again before they next open the reader tabs or pay.
 */

/** The reader terms version the app shows. Must exist in public.terms_versions. */
export const READER_TERMS_VERSION = "reader-2026-10";

export type TermsContext = "signup" | "checkout" | "reask";

export const READER_TERMS_LINKS = [
  { href: "/legal/terms", label: "reader terms" },
  { href: "/legal/refunds", label: "refund policy" },
  { href: "/legal/privacy", label: "privacy notice" },
] as const;

/** What public.terms_status('reader_terms') returns, or null when it could not be read. */
export interface TermsStatusRow {
  current_version: string | null;
  accepted_version: string | null;
  accepted_at: string | null;
  needs_acceptance: boolean | null;
}

/**
 * Must the reader be asked? Yes when they have never accepted, or what
 * they accepted is not the version this release shows. The app's version
 * is the test, not only the database's, so the words on screen and the
 * record agree.
 */
export function needsReaderTerms(accepted: string | null | undefined, current: string = READER_TERMS_VERSION): boolean {
  return accepted !== current;
}

/** The terms page URL for a path the reader was heading to. */
export function termsHref(next: string): string {
  return `/terms?next=${encodeURIComponent(next)}`;
}

/** The context to record on the terms page: a first acceptance, or a re-ask. */
export function termsPageContext(previous: string | null | undefined): TermsContext {
  return previous ? "reask" : "signup";
}

export const TERMS_REQUIRED_MESSAGE = "Please agree to the reader terms to continue.";
export const TERMS_CHANGED_MESSAGE = "Our reader terms have changed. Please reload the page and agree to the new terms to continue.";

export type CheckoutTermsDecision = { ok: true; version: string } | { ok: false; status: 409; error: string; code: "terms_required" | "terms_changed" };

/**
 * May a checkout go ahead on the terms the page showed? The client sends
 * the version printed next to the pay button. Missing means the reader did
 * not see it; a different version means the page is out of date.
 */
export function checkoutTermsDecision(sent: string | null | undefined, current: string = READER_TERMS_VERSION): CheckoutTermsDecision {
  if (!sent) return { ok: false, status: 409, error: TERMS_REQUIRED_MESSAGE, code: "terms_required" };
  if (sent !== current) return { ok: false, status: 409, error: TERMS_CHANGED_MESSAGE, code: "terms_changed" };
  return { ok: true, version: current };
}
