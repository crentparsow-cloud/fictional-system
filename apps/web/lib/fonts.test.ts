import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Self-hosted fonts (appearance setting, F-015 and F-125). Every @font-face in
 * globals.css points at a file in public/fonts, nothing points off the app's
 * own origin, every family the CSS asks for is declared, and the OFL texts
 * ship next to the files.
 */

const CSS = readFileSync(resolve(__dirname, "../app/globals.css"), "utf8");
const FONTS_DIR = resolve(__dirname, "../public/fonts");
const faces = [...CSS.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => m[1]!);

describe("self-hosted fonts", () => {
  it("declares latin and latin-ext faces for each family the CSS uses", () => {
    const families = faces.map((f) => /font-family:\s*"([^"]+)"/.exec(f)?.[1]);
    for (const family of ["Atkinson Hyperlegible Next", "Bricolage Grotesque", "Lexend"]) {
      expect(families.filter((f) => f === family)).toHaveLength(2);
    }
  });

  it("serves every face from /fonts with swap and a unicode-range", () => {
    expect(faces.length).toBeGreaterThan(0);
    for (const face of faces) {
      const url = /src:\s*url\("([^"]+)"\)/.exec(face)?.[1];
      expect(url).toMatch(/^\/fonts\/[a-z0-9-]+\.woff2$/);
      expect(existsSync(resolve(FONTS_DIR, url!.slice("/fonts/".length)))).toBe(true);
      expect(face).toMatch(/font-display:\s*swap/);
      expect(face).toMatch(/unicode-range:/);
    }
  });

  it("never names a third-party font host", () => {
    expect(CSS).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    expect(CSS).not.toMatch(/url\(\s*["']?https?:/);
  });

  it("ships an OFL text for each family and keeps the files small", () => {
    const licences = readdirSync(resolve(FONTS_DIR, "LICENCES"));
    for (const slug of ["atkinson-hyperlegible-next", "bricolage-grotesque", "lexend"]) {
      const file = `${slug}-OFL.txt`;
      expect(licences).toContain(file);
      expect(readFileSync(resolve(FONTS_DIR, "LICENCES", file), "utf8")).toMatch(/SIL OPEN FONT LICENSE Version 1\.1/i);
    }
    const total = readdirSync(FONTS_DIR)
      .filter((f) => f.endsWith(".woff2"))
      .reduce((sum, f) => sum + statSync(resolve(FONTS_DIR, f)).size, 0);
    expect(total).toBeLessThan(250_000);
  });
});
