import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import path from "node:path";
import { InfoFooter } from "@/components/InfoFooter";
import { notFound } from "next/navigation";
import { LEGAL_DOCS, isLegalSlug, type LegalSlug } from "@/lib/legal-docs";
import { markdownToHtml } from "@/lib/markdown";
import { READER_TERMS_VERSION } from "@/lib/terms";

/**
 * F-121. Renders the four legal drafts from docs/legal at build time. The
 * files are lawyer drafts: every page carries the DRAFT banner and is noindex.
 * The Markdown subset is in lib/markdown.ts, shared with the help centre.
 */

const DOCS = LEGAL_DOCS;
type Slug = LegalSlug;
const isSlug = isLegalSlug;

// apps/web is two levels below the repo root, where docs/legal lives.
const LEGAL_DIR = path.join(process.cwd(), "..", "..", "docs", "legal");

const DRAFT_LINE = /^DRAFT for the lawyer\./;

function readDoc(slug: Slug) {
  const raw = readFileSync(path.join(LEGAL_DIR, DOCS[slug].file), "utf8");
  const lines = raw.split(/\r?\n/);
  const banner = lines.find((l) => DRAFT_LINE.test(l)) ?? "DRAFT for the lawyer. Not published.";
  const body = lines.filter((l) => !DRAFT_LINE.test(l)).join("\n");
  return { banner, body };
}

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
  const { banner, body } = readDoc(doc);
  const html = markdownToHtml(body);
  return (
    <main className="wrap info-page">
      <p className="badge demo info-draft" role="note">
        {banner}
      </p>
      {doc === "terms" ? <p className="small muted">Version {READER_TERMS_VERSION}. This is the version readers agree to at sign-up and checkout.</p> : null}
      <article className="legal-doc" dangerouslySetInnerHTML={{ __html: html }} />
      <InfoFooter />
    </main>
  );
}
