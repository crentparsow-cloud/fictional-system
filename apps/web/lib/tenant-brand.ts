/**
 * Tenant branding (F-067) and the locked standards it cannot reach (F-068).
 *
 * Pure: no Node or Next imports, so the stylesheet route, the admin form and
 * the tests share one answer. Mirrors app.tenant_brand_problems in migration
 * 0023, which is what enforces; this file explains the same rules before
 * save and turns a stored brand into CSS custom properties.
 *
 * The brand is a closed shape. There is no setting for custom CSS, scripts,
 * pixels, or for hiding or restyling Help now, the wellness notice, safety
 * copy or the privacy pages. A tenant changes the brand token set only
 * (--brand, --brand-ink, --brand-wash, --hero-bg, --hero-ink, --focus and the
 * display font); globals.css keeps everything else, including --help-bg and
 * --help-ink, locked.
 */

export type ThemeName = "light" | "dark";
export const THEMES: readonly ThemeName[] = ["light", "dark"];

export interface BrandColours {
  primary: string;
  accent: string;
}

export type BrandFont = "house" | "serif" | "humanist" | "system";

export interface BrandLink {
  label: string;
  href: string;
}

export interface TenantBrand {
  v?: 1;
  colours?: Record<ThemeName, BrandColours>;
  font?: BrandFont;
  logo?: { src: string; alt: string };
  favicon?: string;
  footer_links?: BrandLink[];
  legal_links?: BrandLink[];
  sender_name?: string;
}

/** Page background and card colours per theme, from globals.css. */
export const THEME_SURFACES: Readonly<Record<ThemeName, { canvas: string; surface: string }>> = {
  light: { canvas: "#f7f5f0", surface: "#ffffff" },
  dark: { canvas: "#0f1719", surface: "#172226" },
};

/** The two house text colours a brand fill may carry: white and house ink. */
export const INK_CANDIDATES = ["#ffffff", "#16222b"] as const;

/** WCAG 2.2 AA for body text. */
export const AA_TEXT = 4.5;

/** Fonts a tenant may pick for headings. Body text stays Atkinson Hyperlegible. */
export const BRAND_FONTS: Readonly<Record<BrandFont, { label: string; stack: string | null }>> = {
  house: { label: "House (Bricolage Grotesque)", stack: null },
  serif: { label: "Book serif", stack: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif' },
  humanist: { label: "Humanist sans", stack: 'Seravek, "Gill Sans Nova", Ubuntu, Calibri, "DejaVu Sans", sans-serif' },
  system: { label: "System sans", stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
};

const KEYS = ["v", "colours", "font", "logo", "favicon", "footer_links", "legal_links", "sender_name"] as const;
const HEX = /^#[0-9a-f]{6}$/;
const ASSET =
  /^(\/brand\/[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9][a-z0-9._-]{0,80}\.(svg|png|webp)|https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/[A-Za-z0-9/._-]{1,200}\.(svg|png|webp))$/;
const HTTPS = /^https:\/\/[A-Za-z0-9.-]+(:[0-9]+)?(\/[^\s<>"'\\]*)?$/;
const NOT_PLAIN = /[<>\u0000-\u001f\u007f]/;
const NOT_SENDER = /[<>@"\u0000-\u001f\u007f]/;

// ---------------------------------------------------------------------------
// Contrast
// ---------------------------------------------------------------------------

function channel(byte: number): number {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a lower-case #rrggbb colour, or null. */
export function relativeLuminance(hex: string): number | null {
  if (!HEX.test(hex)) return null;
  const r = channel(parseInt(hex.slice(1, 3), 16));
  const g = channel(parseInt(hex.slice(3, 5), 16));
  const b = channel(parseInt(hex.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return 1;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The better house text colour on a fill. Ties go to white, as in SQL. */
export function bestInk(fill: string): string {
  return contrastRatio(fill, INK_CANDIDATES[0]) >= contrastRatio(fill, INK_CANDIDATES[1]) ? INK_CANDIDATES[0] : INK_CANDIDATES[1];
}

/** Rounded down to two places, so 4.497 shows as 4.49 and never looks like a pass. */
export function formatRatio(r: number): string {
  return (Math.floor(r * 100) / 100).toFixed(2);
}

export type ContrastCheckId = "primary_canvas" | "primary_surface" | "primary_button" | "accent_band";

export interface ContrastCheck {
  theme: ThemeName;
  id: ContrastCheckId;
  label: string;
  foreground: string;
  background: string;
  ratio: number;
  pass: boolean;
}

const CHECK_LABELS: Record<ContrastCheckId, string> = {
  primary_canvas: "Main colour as link text on the page",
  primary_surface: "Main colour as link text on cards",
  primary_button: "Button text on the main colour",
  accent_band: "Header text on the second colour",
};

/** The four checks per theme that the database runs, with their figures. */
export function contrastChecks(colours: Record<ThemeName, BrandColours>): ContrastCheck[] {
  const out: ContrastCheck[] = [];
  for (const theme of THEMES) {
    const { primary, accent } = colours[theme];
    const { canvas, surface } = THEME_SURFACES[theme];
    const pairs: [ContrastCheckId, string, string][] = [
      ["primary_canvas", primary, canvas],
      ["primary_surface", primary, surface],
      ["primary_button", bestInk(primary), primary],
      ["accent_band", bestInk(accent), accent],
    ];
    for (const [id, fg, bg] of pairs) {
      const ratio = contrastRatio(fg, bg);
      out.push({ theme, id, label: CHECK_LABELS[id], foreground: fg, background: bg, ratio, pass: ratio >= AA_TEXT });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface BrandProblem {
  field: string;
  message: string;
}

export type BrandResult = { ok: true; brand: TenantBrand } | { ok: false; problems: BrandProblem[] };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function onlyKeys(v: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(v).every((k) => allowed.includes(k));
}

function themeName(t: ThemeName): string {
  return t === "light" ? "Light theme" : "Dark theme";
}

function checkLinks(value: unknown, field: "footer_links" | "legal_links", max: number, problems: BrandProblem[]): BrandLink[] | null {
  if (!Array.isArray(value) || value.length > max) {
    problems.push({ field, message: `Up to ${max} links.` });
    return null;
  }
  const out: BrandLink[] = [];
  for (const l of value) {
    const label = isObject(l) && typeof l.label === "string" ? l.label : "";
    const href = isObject(l) && typeof l.href === "string" ? l.href : "";
    if (
      !isObject(l) ||
      !onlyKeys(l, ["label", "href"]) ||
      label.trim().length < 1 ||
      label.trim().length > 40 ||
      NOT_PLAIN.test(label) ||
      href.length > 300 ||
      !HTTPS.test(href)
    ) {
      problems.push({ field, message: "Each link needs a plain label of up to 40 characters and an address starting https://." });
      return null;
    }
    out.push({ label, href });
  }
  return out;
}

/**
 * The same rules as app.tenant_brand_problems. Returns the brand as stored
 * (only known keys) or every problem in plain words.
 */
export function validateBrand(input: unknown): BrandResult {
  const problems: BrandProblem[] = [];
  if (!isObject(input)) return { ok: false, problems: [{ field: "brand", message: "The brand must be an object." }] };

  for (const k of Object.keys(input)) {
    if (!(KEYS as readonly string[]).includes(k)) {
      problems.push({ field: k, message: `"${k.slice(0, 40)}" is not a brand setting. Help now, the wellness notice, safety copy and privacy pages cannot be changed.` });
    }
  }
  const brand: TenantBrand = {};
  if ("v" in input) {
    if (input.v !== 1) problems.push({ field: "v", message: "Version must be 1." });
    else brand.v = 1;
  }

  if ("colours" in input) {
    const c = input.colours;
    if (!isObject(c) || !("light" in c) || !("dark" in c) || !onlyKeys(c, THEMES)) {
      problems.push({ field: "colours", message: "Colours need a light and a dark set." });
    } else {
      let shapeOk = true;
      for (const t of THEMES) {
        const set = c[t];
        if (!isObject(set) || !onlyKeys(set, ["primary", "accent"]) || typeof set.primary !== "string" || typeof set.accent !== "string" || !HEX.test(set.primary) || !HEX.test(set.accent)) {
          problems.push({ field: `colours.${t}`, message: `${themeName(t)}: give the main and second colour as #rrggbb in lower case.` });
          shapeOk = false;
        }
      }
      if (shapeOk) {
        const colours = c as unknown as Record<ThemeName, BrandColours>;
        for (const check of contrastChecks(colours)) {
          if (!check.pass) {
            problems.push({
              field: `colours.${check.theme}`,
              message: `${themeName(check.theme)}: ${check.label.toLowerCase()} is ${formatRatio(check.ratio)} to 1. It needs at least 4.5 to 1.`,
            });
          }
        }
        brand.colours = { light: { ...colours.light }, dark: { ...colours.dark } };
      }
    }
  }

  if ("font" in input) {
    if (typeof input.font !== "string" || !(input.font in BRAND_FONTS)) problems.push({ field: "font", message: "Pick a font from the list." });
    else brand.font = input.font as BrandFont;
  }

  if ("logo" in input) {
    const l = input.logo;
    const src = isObject(l) && typeof l.src === "string" ? l.src : "";
    const alt = isObject(l) && typeof l.alt === "string" ? l.alt : "";
    if (!isObject(l) || !onlyKeys(l, ["src", "alt"]) || !ASSET.test(src)) {
      problems.push({ field: "logo", message: "The logo must be a /brand/ file or a Supabase public file, in SVG, PNG or WebP." });
    } else if (alt.trim().length < 1 || alt.trim().length > 120 || NOT_PLAIN.test(alt)) {
      problems.push({ field: "logo", message: "The logo needs alt text of up to 120 characters." });
    } else {
      brand.logo = { src, alt };
    }
  }

  if ("favicon" in input) {
    if (typeof input.favicon !== "string" || !ASSET.test(input.favicon)) {
      problems.push({ field: "favicon", message: "The favicon must be a /brand/ file or a Supabase public file, in SVG, PNG or WebP." });
    } else brand.favicon = input.favicon;
  }

  if ("footer_links" in input) {
    const links = checkLinks(input.footer_links, "footer_links", 5, problems);
    if (links) brand.footer_links = links;
  }
  if ("legal_links" in input) {
    const links = checkLinks(input.legal_links, "legal_links", 4, problems);
    if (links) brand.legal_links = links;
  }

  if ("sender_name" in input) {
    const s = input.sender_name;
    if (typeof s !== "string" || s.trim().length < 1 || s.trim().length > 60 || NOT_SENDER.test(s)) {
      problems.push({ field: "sender_name", message: "The sender name must be plain text of up to 60 characters, with no @." });
    } else brand.sender_name = s;
  }

  return problems.length ? { ok: false, problems } : { ok: true, brand };
}

// ---------------------------------------------------------------------------
// Stylesheet
// ---------------------------------------------------------------------------

/** Mix a colour towards another: weight is the share of `a`. */
export function mix(a: string, b: string, weight: number): string {
  const p = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const out = [0, 1, 2].map((i) => Math.round(p(a, i) * weight + p(b, i) * (1 - weight)));
  return `#${out.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

const HOUSE_INK: Record<ThemeName, string> = { light: "#16222b", dark: "#ecefea" };

function themeTokens(theme: ThemeName, c: BrandColours): string[] {
  const { surface } = THEME_SURFACES[theme];
  // A soft wash for chips and selected rows, kept only if house ink still reads on it.
  const wash = mix(c.primary, surface, theme === "light" ? 0.12 : 0.22);
  const lines = [
    `--brand: ${c.primary};`,
    `--brand-ink: ${bestInk(c.primary)};`,
    `--hero-bg: ${c.accent};`,
    `--hero-ink: ${bestInk(c.accent)};`,
    `--focus: ${c.primary};`,
  ];
  if (contrastRatio(HOUSE_INK[theme], wash) >= AA_TEXT) lines.push(`--brand-wash: ${wash};`);
  return lines;
}

const SCOPE = ':root[data-tenant-kind="white_label"]';

/**
 * CSS for a tenant: custom properties only, built from validated values and
 * fixed font stacks. Nothing the tenant typed reaches the stylesheet as
 * text. An invalid brand gives the house look.
 */
export function brandCss(input: unknown): string {
  const head = "/* Tenant brand (F-067). Generated from validated settings; Help now and safety colours are not tenant settings. */\n";
  const result = validateBrand(input);
  if (!result.ok) return head;
  const { brand } = result;
  const blocks: string[] = [];
  const font = brand.font ? BRAND_FONTS[brand.font].stack : null;
  const light = brand.colours ? themeTokens("light", brand.colours.light) : [];
  if (font) light.push(`--f-display: ${font};`);
  if (light.length) blocks.push(`${SCOPE} {\n  ${light.join("\n  ")}\n}`);
  if (brand.colours) {
    const dark = themeTokens("dark", brand.colours.dark).join("\n    ");
    blocks.push(`@media (prefers-color-scheme: dark) {\n  ${SCOPE}:not([data-theme="light"]) {\n    ${dark}\n  }\n}`);
    blocks.push(`${SCOPE}[data-theme="dark"] {\n  ${themeTokens("dark", brand.colours.dark).join("\n  ")}\n}`);
  }
  return head + blocks.join("\n") + (blocks.length ? "\n" : "");
}

/** Parse a database problem line ("contrast light primary_canvas 3.16") for display. */
export function describeDbProblem(line: string): string {
  const m = /^contrast (light|dark) (primary_canvas|primary_surface|primary_button|accent_band) ([0-9.]+)$/.exec(line);
  if (!m) return line.charAt(0).toUpperCase() + line.slice(1) + ".";
  const [, theme, id, ratio] = m;
  return `${themeName(theme as ThemeName)}: ${CHECK_LABELS[id as ContrastCheckId].toLowerCase()} is ${ratio} to 1. It needs at least 4.5 to 1.`;
}

/** The two looks offered for the demo tenant (migration 0023, app.demo_brand). */
export const DEMO_LOOKS = {
  a: { label: "Option A: plum and deep green, book serif headings", primary: "#6b2d5c", accent: "#2e5e57" },
  b: { label: "Option B: navy and ochre, humanist headings", primary: "#23395d", accent: "#8a5a12" },
} as const;
export type DemoLook = keyof typeof DEMO_LOOKS;
export function isDemoLook(v: unknown): v is DemoLook {
  return v === "a" || v === "b";
}
