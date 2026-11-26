/**
 * Reads and renders the legal drafts in docs/legal for /legal/[doc] (F-121).
 *
 * The drafts carry two tokens, "[support email]" and "[company number]", so
 * the solicitor reads plain files. A reader must never see a token (review
 * finding M12), so both are filled here from config at render:
 *
 * - "[support email]" becomes a mailto link when EMAIL_REPLY_TO is set. While
 *   it is blank, the sentence points to the contact page instead.
 * - "[company number]" becomes the number when NEXT_PUBLIC_COMPANY_NUMBER is
 *   set. While it is blank, the sentence that holds it is left out.
 *
 * The pages are built statically, so a change to either variable shows after
 * the next deploy.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { supportContact } from "@/lib/help";
import { LEGAL_DOCS, type LegalSlug } from "@/lib/legal-docs";
import { markdownToHtml } from "@/lib/markdown";

// apps/web is two levels below the repo root, where docs/legal lives.
const LEGAL_DIR = path.join(process.cwd(), "..", "..", "docs", "legal");

const DRAFT_LINE = /^DRAFT(?: for the lawyer)?\./;
const DEFAULT_BANNER = "DRAFT. To be reviewed before launch.";

const CONTACT_LINK = "[our contact page](/contact)";

export type LegalValues = { supportEmail: string | null; companyNumber: string | null };

/** The values the tokens are filled from. Blank or malformed settings give null. */
export function legalValues(env: Record<string, string | undefined> = process.env): LegalValues {
  return { supportEmail: supportContact(env).email, companyNumber: env.NEXT_PUBLIC_COMPANY_NUMBER?.trim() || null };
}

/** Replaces the tokens in a legal draft. Pure, so it can be tested with any values. */
export function fillLegalText(md: string, values: LegalValues): string {
  let out = md;
  if (values.supportEmail) {
    out = out.replaceAll("[support email]", `[${values.supportEmail}](mailto:${values.supportEmail})`);
  } else {
    out = out
      .replace(/\b([Ee])mail \[support email\]/g, (_m, e: string) => `${e === "E" ? "Write" : "write"} to us through ${CONTACT_LINK}`)
      .replace(/\bat \[support email\]/g, `through ${CONTACT_LINK}`)
      .replaceAll("[support email]", CONTACT_LINK);
  }
  if (values.companyNumber) {
    out = out.replaceAll("[company number]", values.companyNumber);
  } else {
    // Leave out the whole sentence, so no half sentence is left behind.
    out = out.replace(/(^|\n)[^.\n]*\[company number\][^.\n]*\.?[ \t]*|[ \t]*[^.\n]*\[company number\][^.\n]*\.?/g, "$1");
  }
  return out;
}

/** The draft banner line and the rest of the file, as written. */
export function readLegalDoc(slug: LegalSlug, dir: string = LEGAL_DIR): { banner: string; body: string } {
  const raw = readFileSync(path.join(dir, LEGAL_DOCS[slug].file), "utf8");
  const lines = raw.split(/\r?\n/);
  const banner = lines.find((l) => DRAFT_LINE.test(l)) ?? DEFAULT_BANNER;
  const body = lines.filter((l) => !DRAFT_LINE.test(l)).join("\n");
  return { banner, body };
}

/** What the page shows: the banner and the body as HTML, with every token filled. */
export function renderLegalDoc(slug: LegalSlug, values: LegalValues = legalValues(), dir?: string): { banner: string; html: string } {
  const { banner, body } = readLegalDoc(slug, dir);
  return { banner, html: markdownToHtml(fillLegalText(body, values)) };
}
