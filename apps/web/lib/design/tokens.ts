/**
 * Builds the theme CSS (plan 1.1, 1.5) from lib/design/directions.ts.
 * Pure: no Node or Next imports, so the script, the tests and the /dev/kit
 * preview all call the same function. The output is committed in
 * app/themes/ and a test checks the files match.
 *
 * What a theme file sets, light and dark: every colour, the two type faces,
 * the three radii and the cover style. Motion and the type scale are
 * structural and live in app/motion.css and app/globals.css.
 */
import { DIRECTIONS, SHELF_IDS, type DirectionId, type Palette } from "./directions";

/** Colours that mean the same thing in every direction: help, demo, stages. */
export const FUNCTIONAL = {
  light: {
    marigold: "#f2b84b",
    "marigold-ink": "#3b2a05",
    rose: "#8a2846",
    "rose-soft": "#f6e3e9",
    "rose-ink": "#ffffff",
    "help-bg": "#8a2846",
    "help-ink": "#ffffff",
    "stage-1-t": "#dcebe2",
    "stage-1-i": "#2d6a4f",
    "stage-2-t": "#f8e0d0",
    "stage-2-i": "#9c4a25",
    "stage-3-t": "#f6eac0",
    "stage-3-i": "#6e520f",
    "stage-4-t": "#d6e6f3",
    "stage-4-i": "#1f5a85",
    "qr-ground": "#ffffff",
    "tile-l": "0.935",
    "tile-c": "0.045",
    "tink-l": "0.42",
    "tink-c": "0.11",
  },
  dark: {
    marigold: "#e3aa45",
    "marigold-ink": "#2a1d03",
    rose: "#e58ba6",
    "rose-soft": "#3a1f29",
    "rose-ink": "#2a0e18",
    "help-bg": "#5a2238",
    "help-ink": "#fbe6ee",
    "stage-1-t": "#1c3328",
    "stage-1-i": "#8fd1ae",
    "stage-2-t": "#3a2419",
    "stage-2-i": "#f2ae86",
    "stage-3-t": "#33290e",
    "stage-3-i": "#e6c46a",
    "stage-4-t": "#172b3c",
    "stage-4-i": "#93c2ea",
    "qr-ground": "#ffffff",
    "tile-l": "0.28",
    "tile-c": "0.035",
    "tink-l": "0.84",
    "tink-c": "0.08",
  },
} as const;

/** Named reading themes (1.5). Neutrals only; the brand colour stays the direction's. */
export const READING_THEMES = {
  paper: {
    label: "Paper",
    light: { canvas: "#f6f1e7", surface: "#fdfbf6", "surface-2": "#efe8da", line: "#d9d0bf", "line-strong": "#868179", ink: "#1f1a14", "ink-soft": "#5b5347" },
    dark: { canvas: "#171511", surface: "#201d18", "surface-2": "#2a261f", line: "#3a352c", "line-strong": "#76726a", ink: "#efe9dc", "ink-soft": "#b3aa99" },
  },
  mist: {
    label: "Mist",
    light: { canvas: "#f2f4f8", surface: "#ffffff", "surface-2": "#e9edf3", line: "#d6dce6", "line-strong": "#7f848d", ink: "#141c2b", "ink-soft": "#4f5a6e" },
    dark: { canvas: "#0e1a2e", surface: "#172540", "surface-2": "#1f2f4d", line: "#2d3f61", "line-strong": "#7384a0", ink: "#eef2f8", "ink-soft": "#aab6c9" },
  },
  plain: {
    label: "Plain",
    light: { canvas: "#ffffff", surface: "#ffffff", "surface-2": "#f4f4f2", line: "#e4e4e0", "line-strong": "#898989", ink: "#141414", "ink-soft": "#55554f" },
    dark: { canvas: "#121212", surface: "#1b1b1b", "surface-2": "#242423", line: "#333331", "line-strong": "#7d7d7a", ink: "#f3f3f0", "ink-soft": "#b5b5ad" },
  },
} as const;
export type ReadingThemeId = keyof typeof READING_THEMES;
export const READING_THEME_IDS = Object.keys(READING_THEMES) as ReadingThemeId[];

export type Scheme = "light" | "dark";

function rgb(hex: string, alpha: number): string {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `rgba(${n(1)}, ${n(3)}, ${n(5)}, ${alpha})`;
}

function paletteLines(p: Palette, scheme: Scheme, id: DirectionId): string[] {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(p)) lines.push(`${k}: ${v};`);
  // The hero is the inverse of the page: no second use of the brand colour.
  // Bright editorial is the exception: a light wash of the brand under dark ink,
  // so the page stays bright and the vermilion button is the only strong colour.
  const wash = id === "bright-editorial";
  lines.push(`hero-bg: ${wash ? p["brand-wash"] : p.ink};`, `hero-ink: ${wash ? p.ink : p.canvas};`, `focus: ${p["brand-text"]};`);
  lines.push(`scrim: ${rgb(p.ink, scheme === "light" ? 0.42 : 0.6)};`);
  if (scheme === "light") {
    lines.push(`shadow: 0 1px 2px ${rgb(p.ink, 0.04)}, 0 6px 20px ${rgb(p.ink, 0.05)};`);
    lines.push(`lift: 0 2px 6px ${rgb(p.ink, 0.08)}, 0 14px 34px ${rgb(p.ink, 0.1)};`);
  } else {
    lines.push(`shadow: none;`, `lift: 0 12px 40px ${rgb("#000000", 0.45)};`);
  }
  for (const [k, v] of Object.entries(FUNCTIONAL[scheme])) lines.push(`${k}: ${v};`);
  lines.push(`confetti-1: var(--brand);`, `confetti-2: var(--marigold);`, `confetti-3: var(--shelf-mind-and-mood-i);`, `confetti-4: var(--shelf-personal-growth-i);`);
  return lines.map((l) => `--${l}`);
}

function shelfLines(id: DirectionId, scheme: Scheme): string[] {
  const d = DIRECTIONS[id];
  return SHELF_IDS.flatMap((s) => [`--shelf-${s}-t: ${d.shelves[s][scheme].tint};`, `--shelf-${s}-i: ${d.shelves[s][scheme].accent};`]);
}

const block = (selector: string, lines: string[], indent = ""): string => `${indent}${selector} {\n${lines.map((l) => `${indent}  ${l}`).join("\n")}\n${indent}}`;

/** The full theme file for one direction. */
export function buildThemeCss(id: DirectionId): string {
  const d = DIRECTIONS[id];
  const structural = [
    `--f-serif: ${d.serifStack};`,
    `--f-sans: ${d.sansStack};`,
    `--radius: ${d.radius}px;`,
    `--radius-sm: ${d.radiusSm}px;`,
    `--pill: ${d.pill}px;`,
    `--cover-radius: ${d.cover.radius};`,
  ];
  const light = [...structural, ...paletteLines(d.light, "light", id), ...shelfLines(id, "light"), "color-scheme: light;"];
  const dark = [...paletteLines(d.dark, "dark", id), ...shelfLines(id, "dark"), "color-scheme: dark;"];
  return [
    `/* Generated by scripts/build-themes.ts from lib/design/directions.ts. Do not edit by hand.\n   Direction: ${d.label} (${id}). */`,
    // [data-scheme] scopes a scheme to one subtree, for /dev/kit, which shows light and dark side by side.
    block(':root,\n[data-scheme="light"]', light),
    block("@media (prefers-color-scheme: dark)", [block(':root:not([data-theme="light"])', dark, "  ")]),
    block(':root[data-theme="dark"],\n:root[data-dim="night"]:not([data-theme="light"]),\n[data-scheme="dark"]', dark),
    "",
  ].join("\n");
}

const NEUTRAL_KEYS = ["canvas", "surface", "surface-2", "line", "line-strong", "ink", "ink-soft"] as const;

/** Named reading themes, light and dark, for app/themes/reading.css. */
export function buildReadingThemesCss(): string {
  const parts = ["/* Generated by scripts/build-themes.ts from lib/design/tokens.ts. Do not edit by hand.\n   Named reading themes (1.5). The attribute is data-reading-theme on <html>. */"];
  for (const id of READING_THEME_IDS) {
    const t = READING_THEMES[id];
    const lines = (s: Scheme) => NEUTRAL_KEYS.map((k) => `--${k}: ${t[s][k]};`);
    const sel = `:root[data-reading-theme="${id}"]`;
    parts.push(block(sel, lines("light")));
    parts.push(block("@media (prefers-color-scheme: dark)", [block(`${sel}:not([data-theme="light"])`, lines("dark"), "  ")]));
    parts.push(block(`${sel}[data-theme="dark"],\n${sel}[data-dim="night"]:not([data-theme="light"])`, lines("dark")));
  }
  parts.push("");
  return parts.join("\n");
}
