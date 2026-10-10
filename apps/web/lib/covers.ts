/**
 * Generated covers (F-117) for demo and public-domain workbooks. Real authors
 * supply their own covers. Plain typographic style only, so a cover never
 * looks like a real publisher's design.
 *
 * One layout family: a tinted panel with a per-genre pattern, an accent rule,
 * the title (up to four lines), the author, and a small badge for Demo or
 * Public domain. 600 x 900 (2:3). No external fonts or images; the font
 * stacks below fall back to whatever the device has.
 *
 * Pure: no Next or Supabase imports, so it runs in tests and in the route.
 */

/**
 * Light theme token values, copied from :root in app/globals.css. An SVG
 * served as an image cannot read CSS variables, so the values live here.
 * Keep in step with globals.css when the tokens change.
 */
export const COVER_TOKENS = {
  canvas: "#f7f5f0",
  surface: "#ffffff",
  surface2: "#efece4",
  line: "#e2ded3",
  ink: "#16222b",
  inkSoft: "#4a5864",
  brand: "#1f4e5a",
  brandWash: "#e3edee",
  marigold: "#f2b84b",
  marigoldInk: "#3b2a05",
  rose: "#8a2846",
  roseSoft: "#f6e3e9",
  stage1t: "#dcebe2",
  stage1i: "#2d6a4f",
  stage2t: "#f8e0d0",
  stage2i: "#9c4a25",
  stage3t: "#f6eac0",
  stage3i: "#6e520f",
  stage4t: "#d6e6f3",
  stage4i: "#1f5a85",
} as const;

const T = COVER_TOKENS;

export type CoverPattern = "waves" | "steps" | "rings" | "dots" | "diagonals" | "chevrons" | "grid" | "bars" | "columns" | "arcs" | "crosses";

export interface GenreStyle {
  tint: string;
  accent: string;
  pattern: CoverPattern;
}

/** One accent and pattern per genre id in content/registry/genres.json. */
export const GENRE_STYLES: Record<string, GenreStyle> = {
  wellbeing: { tint: T.stage1t, accent: T.stage1i, pattern: "waves" },
  personal_development: { tint: T.brandWash, accent: T.brand, pattern: "steps" },
  relationships: { tint: T.roseSoft, accent: T.rose, pattern: "rings" },
  parenting: { tint: T.stage2t, accent: T.stage2i, pattern: "dots" },
  career: { tint: T.stage4t, accent: T.stage4i, pattern: "diagonals" },
  leadership: { tint: T.brandWash, accent: T.brand, pattern: "chevrons" },
  business: { tint: T.stage3t, accent: T.stage3i, pattern: "grid" },
  productivity: { tint: T.stage4t, accent: T.stage4i, pattern: "bars" },
  finance: { tint: T.stage1t, accent: T.stage1i, pattern: "columns" },
  education: { tint: T.stage3t, accent: T.stage3i, pattern: "arcs" },
  life_skills: { tint: T.stage2t, accent: T.stage2i, pattern: "crosses" },
};

const FALLBACK_STYLE: GenreStyle = { tint: T.surface2, accent: T.inkSoft, pattern: "dots" };

export function genreStyle(genreId: string | null | undefined): GenreStyle {
  return (genreId && Object.hasOwn(GENRE_STYLES, genreId) ? GENRE_STYLES[genreId] : undefined) ?? FALLBACK_STYLE;
}

export type CoverBadge = "official" | "made_with_author" | "public_domain" | "demo" | null | undefined;

export interface CoverInput {
  title: string;
  author?: string | null;
  genreId?: string | null;
  badge?: CoverBadge;
}

export const COVER_WIDTH = 600;
export const COVER_HEIGHT = 900;

const DISPLAY_FONT = "Bricolage Grotesque, Avenir Next, Segoe UI, system-ui, sans-serif";
const BODY_FONT = "Atkinson Hyperlegible, system-ui, -apple-system, Segoe UI, sans-serif";

// Characters that XML 1.0 does not allow at all, plus lone surrogates.
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Escape text for an XML text node or a double-quoted attribute. */
export function escapeXml(text: string): string {
  return text
    .replace(INVALID_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Plain alt text for a cover. */
export function coverAlt(title: string, author?: string | null): string {
  const t = clean(title) || "Untitled";
  const a = clean(author ?? "");
  return a ? `Cover of ${t} by ${a}` : `Cover of ${t}`;
}

export interface WrapResult {
  lines: string[];
  truncated: boolean;
}

/**
 * Greedy word wrap to at most maxLines of maxChars each. A word longer than
 * a line is split. Overflow ends the last line with an ellipsis.
 */
export function wrapLines(text: string, maxChars: number, maxLines: number): WrapResult {
  const words = clean(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const raw of words) {
    const chunks = splitLong(raw, maxChars);
    for (const word of chunks) {
      if (!line) line = word;
      else if (line.length + 1 + word.length <= maxChars) line += " " + word;
      else {
        lines.push(line);
        line = word;
      }
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return { lines, truncated: false };

  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1] ?? "";
  kept[maxLines - 1] = (last.length + 1 > maxChars ? last.slice(0, maxChars - 1) : last).replace(/[\s.,;:-]+$/, "") + "…";
  return { lines: kept, truncated: true };
}

// Title sizes to try, largest first. Width per character is an estimate for
// a bold sans; the panel is 520 wide and the title block about 290 tall.
const TITLE_SIZES = [64, 56, 48, 42] as const;
const SMALLEST_TITLE = 42;
const CHAR_WIDTH = 0.56;
const TEXT_WIDTH = 520;
const TITLE_BLOCK = 290;
const LINE_HEIGHT = 1.12;
const MAX_TITLE_LINES = 4;

export function layoutTitle(title: string): { size: number; lines: string[] } {
  const text = clean(title) || "Untitled";
  for (const size of TITLE_SIZES) {
    const maxChars = Math.floor(TEXT_WIDTH / (size * CHAR_WIDTH));
    const fitLines = Math.min(MAX_TITLE_LINES, Math.floor(TITLE_BLOCK / (size * LINE_HEIGHT)));
    const wrapped = wrapLines(text, maxChars, fitLines);
    if (!wrapped.truncated) return { size, lines: wrapped.lines };
  }
  const size = SMALLEST_TITLE;
  const maxChars = Math.floor(TEXT_WIDTH / (size * CHAR_WIDTH));
  return { size, lines: wrapLines(text, maxChars, MAX_TITLE_LINES).lines };
}

function badgeLabel(badge: CoverBadge): string | null {
  if (badge === "demo") return "Demo";
  if (badge === "public_domain") return "Public domain";
  return null;
}

/** The cover as a standalone SVG document. */
export function buildCoverSvg(input: CoverInput): string {
  const style = genreStyle(input.genreId);
  const title = layoutTitle(input.title);
  const authorText = clean(input.author ?? "");
  const author = authorText ? wrapLines(authorText, 34, 1).lines[0] : null;
  const badge = badgeLabel(input.badge);
  const label = coverAlt(input.title, input.author);

  const panel = { x: 40, y: 40, w: 520, h: 380 };
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${COVER_WIDTH}" height="${COVER_HEIGHT}" viewBox="0 0 ${COVER_WIDTH} ${COVER_HEIGHT}" role="img" aria-label="${escapeXml(label)}">`,
    `<title>${escapeXml(label)}</title>`,
    `<defs><clipPath id="panel"><rect x="${panel.x}" y="${panel.y}" width="${panel.w}" height="${panel.h}" rx="14"/></clipPath></defs>`,
    `<rect width="${COVER_WIDTH}" height="${COVER_HEIGHT}" fill="${T.canvas}"/>`,
    `<rect x="${panel.x}" y="${panel.y}" width="${panel.w}" height="${panel.h}" rx="14" fill="${style.tint}"/>`,
    `<g clip-path="url(#panel)" fill="none" stroke="${style.accent}" stroke-width="6" stroke-linecap="round" opacity="0.32">${pattern(style.pattern, panel, style.accent)}</g>`,
  );

  if (badge) {
    const demo = input.badge === "demo";
    const w = Math.round(badge.length * 13 + 36);
    parts.push(
      `<g>`,
      `<rect x="64" y="64" width="${w}" height="40" rx="20" fill="${demo ? T.marigold : T.surface}"${demo ? "" : ` stroke="${T.line}" stroke-width="2"`}/>`,
      `<text x="${64 + w / 2}" y="91" text-anchor="middle" font-family="${BODY_FONT}" font-size="22" font-weight="700" fill="${demo ? T.marigoldInk : T.ink}">${escapeXml(badge)}</text>`,
      `</g>`,
    );
  }

  parts.push(`<rect x="40" y="460" width="72" height="6" rx="3" fill="${style.accent}"/>`);

  const lineGap = Math.round(title.size * LINE_HEIGHT);
  const firstBaseline = 500 + title.size;
  parts.push(`<text font-family="${DISPLAY_FONT}" font-size="${title.size}" font-weight="700" fill="${T.ink}" letter-spacing="-0.5">`);
  title.lines.forEach((ln, i) => {
    parts.push(`<tspan x="40" y="${firstBaseline + i * lineGap}">${escapeXml(ln)}</tspan>`);
  });
  parts.push(`</text>`);

  if (author) {
    parts.push(`<text x="40" y="836" font-family="${BODY_FONT}" font-size="28" fill="${T.inkSoft}">${escapeXml(author)}</text>`);
  }
  parts.push(`<rect x="40" y="860" width="520" height="2" fill="${T.line}"/>`);
  parts.push(`</svg>`);
  return parts.join("");
}

export const COVER_PATTERNS: readonly CoverPattern[] = ["waves", "steps", "rings", "dots", "diagonals", "chevrons", "grid", "bars", "columns", "arcs", "crosses"];

/**
 * A pattern-only cover for a collection (build list 2.3): the same tint,
 * accent and pattern family as a workbook cover, with no title or author on
 * it. The genre picks the tint and accent; an explicit pattern overrides the
 * genre's own. Returns the inner SVG markup for a 600 x 420 viewBox, to be
 * placed inside an <svg> the caller labels.
 */
export function buildPatternCover(genreId: string | null | undefined, patternOverride?: string | null, clipId = "collection-panel"): string {
  const style = genreStyle(genreId);
  const kind = (COVER_PATTERNS as readonly string[]).includes(patternOverride ?? "") ? (patternOverride as CoverPattern) : style.pattern;
  const panel = { x: 20, y: 20, w: 560, h: 380 };
  return [
    `<rect width="600" height="420" fill="${T.canvas}"/>`,
    `<rect x="${panel.x}" y="${panel.y}" width="${panel.w}" height="${panel.h}" rx="14" fill="${style.tint}"/>`,
    `<g clip-path="url(#${clipId})" fill="none" stroke="${style.accent}" stroke-width="6" stroke-linecap="round" opacity="0.32">${pattern(kind, panel, style.accent)}</g>`,
    `<rect x="${panel.x}" y="${panel.y + panel.h - 6}" width="${panel.w}" height="6" fill="${style.accent}" clip-path="url(#${clipId})"/>`,
  ].join("");
}

export function collectionPanelClip(clipId = "collection-panel"): string {
  return `<clipPath id="${clipId}"><rect x="20" y="20" width="560" height="380" rx="14"/></clipPath>`;
}

// ---------------------------------------------------------------------------

function clean(text: string): string {
  return text.replace(INVALID_XML, "").replace(/\s+/g, " ").trim();
}

function splitLong(word: string, max: number): string[] {
  if (word.length <= max) return [word];
  const out: string[] = [];
  for (let i = 0; i < word.length; i += max) out.push(word.slice(i, i + max));
  return out;
}

type Box = { x: number; y: number; w: number; h: number };

/** Simple geometric patterns, drawn in the panel's box. Stroke comes from the group. */
function pattern(kind: CoverPattern, b: Box, accent: string): string {
  const out: string[] = [];
  const right = b.x + b.w;
  const bottom = b.y + b.h;
  switch (kind) {
    case "waves":
      for (let y = b.y + 30; y < bottom + 40; y += 44) {
        let d = `M${b.x - 20} ${y}`;
        for (let x = b.x - 20; x < right + 40; x += 80) d += ` q20 -18 40 0 t40 0`;
        out.push(`<path d="${d}"/>`);
      }
      break;
    case "steps":
      for (let i = 0; i < 7; i++) {
        const x = b.x + 40 + i * 70;
        const y = bottom - 40 - i * 45;
        out.push(`<path d="M${x} ${bottom + 10} V${y} H${x + 70}"/>`);
      }
      break;
    case "rings":
      for (let row = 0; row < 4; row++)
        for (let col = 0; col < 5; col++) out.push(`<circle cx="${b.x + 50 + col * 110 + (row % 2) * 55}" cy="${b.y + 60 + row * 95}" r="52"/>`);
      break;
    case "dots":
      for (let y = b.y + 30; y < bottom; y += 44)
        for (let x = b.x + 30; x < right; x += 44) out.push(`<circle cx="${x}" cy="${y}" r="7" fill="${accent}" stroke="none"/>`);
      break;
    case "diagonals":
      for (let x = b.x - b.h; x < right; x += 46) out.push(`<path d="M${x} ${bottom} L${x + b.h} ${b.y}"/>`);
      break;
    case "chevrons":
      for (let y = b.y + 40; y < bottom + 40; y += 60)
        for (let x = b.x + 20; x < right; x += 100) out.push(`<path d="M${x} ${y} l40 -30 l40 30"/>`);
      break;
    case "grid":
      for (let x = b.x + 40; x < right; x += 52) out.push(`<path d="M${x} ${b.y} V${bottom}"/>`);
      for (let y = b.y + 40; y < bottom; y += 52) out.push(`<path d="M${b.x} ${y} H${right}"/>`);
      break;
    case "bars":
      for (let i = 0, y = b.y + 40; y < bottom; i++, y += 46) {
        const len = 120 + ((i * 97) % 300);
        out.push(`<path d="M${b.x + 40} ${y} h${len}"/>`);
      }
      break;
    case "columns":
      for (let i = 0, x = b.x + 50; x < right - 20; i++, x += 56) {
        const h = 60 + ((i * 53) % 220);
        out.push(`<rect x="${x}" y="${bottom - h}" width="30" height="${h + 10}" rx="4" fill="${accent}" stroke="none"/>`);
      }
      break;
    case "arcs":
      for (let r = 60; r < 520; r += 48) out.push(`<circle cx="${b.x + b.w / 2}" cy="${bottom + 20}" r="${r}"/>`);
      break;
    case "crosses":
      for (let y = b.y + 40; y < bottom; y += 64)
        for (let x = b.x + 40; x < right; x += 64) out.push(`<path d="M${x - 12} ${y} h24 M${x} ${y - 12} v24"/>`);
      break;
  }
  return out.join("");
}
