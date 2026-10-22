import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Quote image (12.3): a line chosen from the workbook's own text, drawn as a
 * shareable picture. Only text the workbook itself holds can be quoted, never
 * a reader's answer. The picture route is public, so it draws only lines the
 * server has signed (HMAC with QUOTE_IMAGE_SECRET) for the exact workbook and
 * line. Anyone who edits the address gets a 404, so the route cannot be used
 * to print arbitrary words under Akana's name.
 *
 * Lines are limited to the glyphs in the share-image fonts (Latin-1 and a few
 * punctuation marks), so nothing renders as a box.
 */

export const QUOTE_MIN = 20;
export const QUOTE_MAX = 200;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The characters the share-image font subset holds (scripts/build-og-fonts.py). */
const SAFE = new RegExp("^[\\u0020-\\u007e\\u00a0-\\u00ff\\u2013\\u2014\\u2018\\u2019\\u201c\\u201d\\u2026\\u20ac]+$");

export function cleanLine(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export function isQuotable(line: string): boolean {
  return line.length >= QUOTE_MIN && line.length <= QUOTE_MAX && SAFE.test(line) && !/https?:\/\//i.test(line);
}

/** Sentences of a paragraph, split after . ! ? when a capital or quote follows. */
export function sentences(text: string): string[] {
  const flat = cleanLine(text);
  if (!flat) return [];
  return flat
    .split(/(?<=[.!?])\s+(?=[A-Z“"'‘])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

interface UnitLike {
  intro?: unknown;
  takeaway?: unknown;
  ideas?: unknown;
}

const asText = (v: unknown): string => (typeof v === "string" ? v : "");

/** The quotable sentences of a unit's own text: intro, key ideas, takeaway. At most `cap`, no repeats. */
export function quotableLines(unitBody: unknown, cap = 12): string[] {
  const unit: UnitLike = typeof unitBody === "object" && unitBody !== null ? (unitBody as UnitLike) : {};
  const parts: string[] = [asText(unit.intro)];
  if (Array.isArray(unit.ideas)) {
    for (const idea of unit.ideas) {
      if (idea && typeof idea === "object") parts.push(asText((idea as { body?: unknown }).body));
    }
  }
  parts.push(asText(unit.takeaway));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    for (const s of sentences(p)) {
      if (!isQuotable(s) || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
      if (out.length >= cap) return out;
    }
  }
  return out;
}

function mac(secret: string, slug: string, line: string): string {
  return createHmac("sha256", secret).update(`quote\n${slug}\n${line}`, "utf8").digest("hex");
}

export function signQuote(secret: string, slug: string, line: string): string | null {
  if (!secret || !SLUG.test(slug) || !isQuotable(line)) return null;
  return mac(secret, slug, line).slice(0, 32);
}

export function verifyQuote(secret: string, slug: string, line: string, sig: string): boolean {
  if (!secret || !SLUG.test(slug) || !isQuotable(line) || !/^[0-9a-f]{32}$/.test(sig)) return false;
  const want = Buffer.from(mac(secret, slug, line).slice(0, 32));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** The picture's address on this site. */
export function quoteImagePath(slug: string, line: string, sig: string): string {
  const q = new URLSearchParams({ w: slug, l: line, s: sig });
  return `/api/quote-image?${q.toString()}`;
}
