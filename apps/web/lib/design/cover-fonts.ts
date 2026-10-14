import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Direction } from "./directions";
import { COVER_FONT_FAMILIES } from "./cover-render";

/**
 * The subset faces Satori draws with (plan 1.9). Read once per process and per
 * direction. If a file cannot be read the renderer falls back to Satori's own
 * default face, so a missing file never takes a cover or a share image down.
 * Files are in lib/design/og-fonts (scripts/build-og-fonts.py); next.config.ts
 * lists them for file tracing.
 */
const FILES: Record<string, { file: string; weight: 600 | 700 }> = {
  Literata: { file: "literata-700.woff", weight: 700 },
  "Akana Serif": { file: "akana-serif-700.woff", weight: 700 },
  "Akana Sans": { file: "akana-sans-600.woff", weight: 600 },
  "Bricolage Grotesque": { file: "bricolage-grotesque-600.woff", weight: 600 },
  Lexend: { file: "lexend-600.woff", weight: 600 },
};

export interface SatoriFont {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 600 | 700;
  style: "normal";
}

const cache = new Map<string, SatoriFont[]>();

function load(family: string, as: string): SatoriFont | null {
  const f = FILES[family];
  if (!f) return null;
  try {
    const buf = readFileSync(join(process.cwd(), "lib/design/og-fonts", f.file));
    const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    return { name: as, data, weight: f.weight, style: "normal" };
  } catch {
    return null;
  }
}

export function coverFonts(d: Direction): SatoriFont[] {
  const hit = cache.get(d.id);
  if (hit) return hit;
  const fonts = [load(d.serifName, COVER_FONT_FAMILIES.serif), load(d.sansName, COVER_FONT_FAMILIES.sans)].filter((f): f is SatoriFont => f !== null);
  cache.set(d.id, fonts);
  return fonts;
}

/** Total bytes of the faces a direction loads, for the bundle budget test. */
export function coverFontBytes(d: Direction): number {
  return coverFonts(d).reduce((n, f) => n + f.data.byteLength, 0);
}
