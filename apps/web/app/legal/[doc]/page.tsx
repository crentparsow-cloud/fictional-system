import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { brand } from "@/lib/brand";

/**
 * F-121. Renders the four legal drafts from docs/legal at build time. The
 * files are lawyer drafts: every page carries the DRAFT banner and is noindex.
 * The Markdown subset handled here is headings, paragraphs, lists, tables,
 * bold and inline code. Nothing else is in the drafts.
 */

const DOCS = {
  terms: { file: "reader-terms.md", title: "Reader terms" },
  privacy: { file: "privacy-notice.md", title: "Privacy notice" },
  cookies: { file: "cookie-statement.md", title: "Cookie statement" },
  refunds: { file: "refund-policy.md", title: "Refund policy" },
} as const;

type Slug = keyof typeof DOCS;

const isSlug = (s: string): s is Slug => s in DOCS;

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

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inline(s: string) {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function tableRow(line: string, cell: "td" | "th") {
  const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|");
  return `<tr>${cells.map((c) => `<${cell}>${inline(c.trim())}</${cell}>`).join("")}</tr>`;
}

function markdownToHtml(md: string) {
  const out: string[] = [];
  const lines = md.split("\n");
  const at = (n: number) => lines[n] ?? "";
  let i = 0;
  while (i < lines.length) {
    const line = at(i);
    if (line.trim() === "") {
      i++;
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = (h[1] ?? "#").length;
      out.push(`<h${level}>${inline(h[2] ?? "")}</h${level}>`);
      i++;
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(at(i))) {
        items.push(`<li>${inline(at(i).replace(/^[-*]\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(at(i))) {
        items.push(`<li>${inline(at(i).replace(/^\d+\.\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }
    if (line.startsWith("|")) {
      const head = tableRow(line, "th");
      i++;
      if (i < lines.length && /^\|[\s:|-]+\|$/.test(at(i))) i++;
      const rows: string[] = [];
      while (i < lines.length && at(i).startsWith("|")) {
        rows.push(tableRow(at(i), "td"));
        i++;
      }
      out.push(`<table><thead>${head}</thead><tbody>${rows.join("")}</tbody></table>`);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && at(i).trim() !== "" && !/^(#{1,3}\s|[-*]\s|\d+\.\s|\|)/.test(at(i))) {
      para.push(at(i));
      i++;
    }
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out.join("\n");
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
  };
}

export default async function LegalDocPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  if (!isSlug(doc)) notFound();
  const { banner, body } = readDoc(doc);
  const html = markdownToHtml(body);
  return (
    <main className="wrap" style={{ paddingBlock: "2.5rem" }}>
      <p className="badge demo" role="note" style={{ marginBlockEnd: "1.5rem" }}>
        {banner}
      </p>
      <article className="legal-doc" dangerouslySetInnerHTML={{ __html: html }} />
      <footer className="footer" style={{ marginBlockStart: "2.5rem" }}>
        <p style={{ marginBlockEnd: "0.4rem" }}>
          <Link href="/legal/terms">Terms</Link> · <Link href="/legal/privacy">Privacy</Link> ·{" "}
          <Link href="/legal/cookies">Cookies</Link> · <Link href="/legal/refunds">Refunds</Link>
        </p>
        <p style={{ marginBlockEnd: 0 }}>{brand.wellnessNotice}</p>
      </footer>
    </main>
  );
}
