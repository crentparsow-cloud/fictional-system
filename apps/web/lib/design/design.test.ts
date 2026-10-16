import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_DIRECTION, DIRECTIONS, DIRECTION_IDS, SHELF_IDS, type Palette } from "./directions";
import { buildReadingThemesCss, buildThemeCss, FUNCTIONAL, READING_THEMES } from "./tokens";
import { contrast } from "./contrast";
import { MOTION_MS } from "../motion";
import { DIRECTION_IDS as MJS_IDS, DEFAULT_DIRECTION as MJS_DEFAULT, resolveDirection } from "../../design-direction.mjs";
import { directionFromEnv } from "./active";

const WEB = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");

describe("theme files", () => {
  it("are the committed output of the generator (run pnpm design:themes after editing lib/design)", () => {
    for (const id of DIRECTION_IDS) expect(read(`app/themes/${id}.css`), id).toBe(buildThemeCss(id));
    expect(read("app/themes/reading.css")).toBe(buildReadingThemesCss());
  });

  const REQUIRED = [
    "canvas", "surface", "surface-2", "line", "line-strong", "ink", "ink-soft", "brand", "brand-ink", "brand-text", "brand-wash", "highlight",
    "hero-bg", "hero-ink", "focus", "scrim", "shadow", "lift", "marigold", "marigold-ink", "rose", "rose-soft", "rose-ink", "help-bg", "help-ink",
    "stage-1-t", "stage-1-i", "stage-4-t", "stage-4-i", "qr-ground", "confetti-1", "confetti-4",
    ...SHELF_IDS.flatMap((s) => [`shelf-${s}-t`, `shelf-${s}-i`]),
  ];

  it("define every token, in light and dark, for every direction", () => {
    for (const id of DIRECTION_IDS) {
      const css = read(`app/themes/${id}.css`);
      const dark = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"));
      const light = css.slice(0, css.indexOf("@media (prefers-color-scheme: dark)"));
      for (const t of REQUIRED) {
        expect(light, `${id} light --${t}`).toMatch(new RegExp(`--${t}:`));
        expect(dark, `${id} dark --${t}`).toMatch(new RegExp(`--${t}:`));
      }
      for (const t of ["f-serif", "f-sans", "radius", "radius-sm", "pill", "cover-radius"]) expect(light, `${id} --${t}`).toMatch(new RegExp(`--${t}:`));
      expect(light).toContain("color-scheme: light");
      expect(dark).toContain("color-scheme: dark");
      expect(css).toContain('[data-theme="dark"]');
    }
  });

  it("have named reading themes, each in light and dark", () => {
    const css = read("app/themes/reading.css");
    for (const t of Object.keys(READING_THEMES)) {
      expect(css).toContain(`:root[data-reading-theme="${t}"] {`);
      expect(css).toContain(`:root[data-reading-theme="${t}"][data-theme="dark"]`);
    }
  });
});

describe("no raw colour outside the theme files", () => {
  // Places where a colour value is the point: the theme data, the generator, and two
  // contracts that cannot read CSS variables (the tenant colours the database also checks,
  // and the print stylesheet of the downloadable export).
  const ALLOWED = new Set(["lib/design/directions.ts", "lib/design/tokens.ts", "lib/tenant-brand.ts", "lib/export.ts"]);
  const COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/;

  function files(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".next", "public", "e2e", "__snapshots__"].includes(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) files(p, out);
      else if (/\.(css|ts|tsx|mjs)$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name)) out.push(p);
    }
    return out;
  }

  it("keeps hex and colour functions in the theme data and nowhere else", () => {
    const offenders: string[] = [];
    for (const f of [...files(join(WEB, "app")), ...files(join(WEB, "components")), ...files(join(WEB, "lib")), ...files(join(WEB, "../../packages/engine/src"))]) {
      const rel = relative(WEB, f).replace(/\\/g, "/");
      if (rel.startsWith("app/themes/") && rel.endsWith(".css")) continue;
      if (ALLOWED.has(rel)) continue;
      const src = readFileSync(f, "utf8");
      src.split("\n").forEach((line, i) => {
        // The mailer and CSV code use "#" in other ways; a colour needs hex digits right after it.
        if (COLOUR.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 80)}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});

function pairs(p: Palette) {
  return [
    ["ink on canvas", p.ink, p.canvas, 4.5],
    ["ink on surface", p.ink, p.surface, 4.5],
    ["ink on surface-2", p.ink, p["surface-2"], 4.5],
    ["ink-soft on canvas", p["ink-soft"], p.canvas, 4.5],
    ["ink-soft on surface", p["ink-soft"], p.surface, 4.5],
    ["brand-text on canvas", p["brand-text"], p.canvas, 4.5],
    ["brand-text on surface", p["brand-text"], p.surface, 4.5],
    ["brand-text on brand-wash", p["brand-text"], p["brand-wash"], 4.5],
    ["brand-ink on brand", p["brand-ink"], p.brand, 4.5],
    ["ink on highlight", p.ink, p.highlight, 4.5],
    ["line-strong on canvas", p["line-strong"], p.canvas, 3],
    ["line-strong on surface", p["line-strong"], p.surface, 3],
    // Not checked: brand on canvas. Quiet confidence uses an amber brand (1.9 to 1 on its light canvas), so
    // the brand colour is a fill behind brand-ink in every direction, and the text version is brand-text.
  ] as const;
}

describe("contrast (WCAG AA)", () => {
  for (const id of DIRECTION_IDS) {
    for (const scheme of ["light", "dark"] as const) {
      const d = DIRECTIONS[id];
      it(`${id} ${scheme}: text pairs 4.5 to 1, large text and controls 3 to 1`, () => {
        for (const [name, fg, bg, min] of pairs(d[scheme])) expect(contrast(fg, bg), `${name} ${fg} on ${bg}`).toBeGreaterThanOrEqual(min);
      });

      it(`${id} ${scheme}: every shelf accent reads on its tile (4.5) and on the canvas (3 for the icon and rule)`, () => {
        const canvas = d[scheme].canvas;
        for (const s of SHELF_IDS) {
          const { tint, accent } = d.shelves[s][scheme];
          expect(contrast(accent, tint), `${s} accent on tile`).toBeGreaterThanOrEqual(4.5);
          expect(contrast(accent, canvas), `${s} accent on canvas`).toBeGreaterThanOrEqual(3);
        }
      });
    }
  }

  it("meaning colours (help, demo, rose) read on their own ground in both schemes", () => {
    for (const scheme of ["light", "dark"] as const) {
      const f = FUNCTIONAL[scheme];
      expect(contrast(f["help-ink"], f["help-bg"])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(f["marigold-ink"], f.marigold)).toBeGreaterThanOrEqual(4.5);
      for (const n of [1, 2, 3, 4] as const) expect(contrast(f[`stage-${n}-i`], f[`stage-${n}-t`]), `stage ${n}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("named reading themes keep text at 4.5 to 1 and control borders at 3 to 1", () => {
    for (const [name, t] of Object.entries(READING_THEMES)) {
      for (const scheme of ["light", "dark"] as const) {
        const p = t[scheme];
        expect(contrast(p.ink, p.canvas), `${name} ${scheme} ink`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p["ink-soft"], p.surface), `${name} ${scheme} soft`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p["line-strong"], p.canvas), `${name} ${scheme} border`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe("the build-time switch", () => {
  it("lists the same directions as the data and defaults to bright-editorial", () => {
    expect(MJS_IDS).toEqual([...DIRECTION_IDS]);
    expect(MJS_DEFAULT).toBe(DEFAULT_DIRECTION);
    expect(DEFAULT_DIRECTION).toBe("bright-editorial");
  });
  it("falls back for blank or unknown values", () => {
    for (const fn of [resolveDirection, directionFromEnv]) {
      expect(fn(undefined)).toBe("bright-editorial");
      expect(fn("")).toBe("bright-editorial");
      expect(fn("neon")).toBe("bright-editorial");
      expect(fn("quiet-confidence")).toBe("quiet-confidence");
      expect(fn(" bright-editorial ")).toBe("bright-editorial");
    }
  });
});

describe("motion tokens", () => {
  it("match lib/motion.ts", () => {
    const css = read("app/motion.css");
    const px = (name: string) => Number(new RegExp(`--dur-${name}:\\s*(\\d+)ms`).exec(css)?.[1]);
    for (const [k, v] of Object.entries(MOTION_MS)) expect(px(k), k).toBe(v);
  });
  it("has reduced-motion rules for the system setting and the reader's setting", () => {
    const css = read("app/motion.css");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(':root[data-motion="reduce"]');
  });
  it("leaves no raw duration in the stylesheet transitions", () => {
    const css = read("app/globals.css");
    expect(css.match(/transition:[^;]*\b\d*\.?\d+m?s\b/g) ?? []).toEqual([]);
  });
});

describe("self-hosted fonts per direction", () => {
  const PUBLIC = join(WEB, "public/fonts");
  const LATIN_EXT_AND_READER_FACES = 0; // reader faces (Atkinson, OpenDyslexic) load only when chosen
  it("keeps each direction's Latin faces under 250 KB and ships the OFL text", () => {
    for (const id of DIRECTION_IDS) {
      const d = DIRECTIONS[id];
      let total = LATIN_EXT_AND_READER_FACES;
      for (const f of d.fontFiles) {
        expect(existsSync(join(PUBLIC, f)), `${id} ${f}`).toBe(true);
        total += statSync(join(PUBLIC, f)).size;
      }
      expect(total, `${id} ${total} bytes`).toBeLessThan(250_000);
    }
    const lic = readdirSync(join(PUBLIC, "LICENCES"));
    for (const f of ["literata-OFL.txt", "akana-serif-from-source-serif-4-OFL.txt", "akana-sans-from-source-sans-3-OFL.txt"]) expect(lic).toContain(f);
  });
  it("declares each face in fonts.css and points at a file that exists", () => {
    const css = read("app/fonts.css") + read("app/globals.css");
    const urls = [...css.matchAll(/url\("\/fonts\/([^"]+)"\)/g)].map((m) => m[1]!);
    expect(urls.length).toBeGreaterThanOrEqual(5);
    expect(read("app/fonts.css")).not.toMatch(/https?:/);
    for (const u of urls) expect(existsSync(join(PUBLIC, u)), u).toBe(true);
    for (const id of DIRECTION_IDS) for (const f of DIRECTIONS[id].fontFiles) expect(urls, `${id} ${f}`).toContain(f);
  });
  it("renames the subsets whose licence reserves the name", () => {
    expect(DIRECTIONS["bright-editorial"].serifName).toBe("Akana Serif");
    expect(DIRECTIONS["paper-and-ink"].sansName).toBe("Akana Sans");
    for (const id of DIRECTION_IDS) expect(JSON.stringify([DIRECTIONS[id].serifStack, DIRECTIONS[id].sansStack])).not.toMatch(/Source/);
    const doc = read("../../docs/FONTS.md");
    for (const family of ["Literata", "Source Serif 4", "Source Sans 3", "Bricolage Grotesque", "Lexend", "Atkinson Hyperlegible", "Libre Franklin"]) expect(doc).toContain(family);
  });
  it("keeps the Satori faces far under the 500 KB bundle limit", () => {
    const dir = join(WEB, "lib/design/og-fonts");
    const size = (n: string) => statSync(join(dir, n)).size;
    const per = {
      "paper-and-ink": ["literata-700.woff", "akana-sans-600.woff"],
      "bright-editorial": ["akana-serif-700.woff", "bricolage-grotesque-600.woff"],
      "quiet-confidence": ["literata-700.woff", "lexend-600.woff"],
    } as const;
    for (const id of DIRECTION_IDS) expect(per[id].reduce((n, f) => n + size(f), 0), id).toBeLessThan(100_000);
    expect(readdirSync(dir).reduce((n, f) => n + size(f), 0)).toBeLessThan(500_000);
  });
});
