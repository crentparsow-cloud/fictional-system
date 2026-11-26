import type { Metadata } from "next";
import { InfoFooter } from "@/components/InfoFooter";
import { notFound } from "next/navigation";
import { LEGAL_DOCS, isLegalSlug, type LegalSlug } from "@/lib/legal-docs";
import { renderLegalDoc } from "@/lib/legal-render";
import { READER_TERMS_VERSION } from "@/lib/terms";

/**
 * F-121. Renders the four legal drafts from docs/legal at build time. The
 * files are lawyer drafts: every page carries the DRAFT banner and is noindex.
 * The Markdown subset is in lib/markdown.ts, shared with the help centre.
 * lib/legal-render.ts fills the support address and company number from
 * config, so no square-bracket placeholder reaches a reader (M12).
 */

const DOCS = LEGAL_DOCS;
type Slug = LegalSlug;
const isSlug = isLegalSlug;

export function generateStaticParams() {
  return (Object.keys(DOCS) as Slug[]).map((doc) => ({ doc }));
}

export const dynamicParams = false;
// Rendered at build time so the Markdown is read from the repo, not at request time on the server.
export const dynamic = "force-static";

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const { doc } = await params;
  return {
    title: isSlug(doc) ? `${DOCS[doc].title} (draft)` : "Not found",
    robots: { index: false, follow: false },
    ...(isSlug(doc) ? { alternates: { canonical: `/legal/${doc}` } } : {}),
  };
}

export default async function LegalDocPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  if (!isSlug(doc)) notFound();
  const { banner, html } = renderLegalDoc(doc);
  return (
    <main className="wrap d-page-pad d-narrow">
      <p className="badge demo info-draft d-draft" role="note">
        {banner}
      </p>
      {doc === "terms" ? <p className="small muted">Version {READER_TERMS_VERSION}. This is the version readers agree to at sign-up and checkout.</p> : null}
      <article className="legal-doc d-prose" dangerouslySetInnerHTML={{ __html: html }} />
      <InfoFooter />
    </main>
  );
}
