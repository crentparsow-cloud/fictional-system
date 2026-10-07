/**
 * The legal pages under /legal (F-121), rendered from docs/legal. One list
 * for the page, the sitemap and the tests.
 */
export const LEGAL_DOCS = {
  terms: { file: "reader-terms.md", title: "Reader terms" },
  privacy: { file: "privacy-notice.md", title: "Privacy notice" },
  cookies: { file: "cookie-statement.md", title: "Cookie statement" },
  refunds: { file: "refund-policy.md", title: "Refund policy" },
} as const;

export type LegalSlug = keyof typeof LEGAL_DOCS;

export const LEGAL_SLUGS = Object.keys(LEGAL_DOCS) as LegalSlug[];

export function isLegalSlug(s: string): s is LegalSlug {
  return Object.prototype.hasOwnProperty.call(LEGAL_DOCS, s);
}
