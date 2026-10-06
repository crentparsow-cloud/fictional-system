import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildCoverSvg, COVER_HEIGHT, COVER_WIDTH, coverAlt, escapeXml, GENRE_STYLES, layoutTitle, wrapLines } from "./covers";

const genres = JSON.parse(readFileSync(fileURLToPath(new URL("../../../content/registry/genres.json", import.meta.url)), "utf8")) as {
  genres: { id: string }[];
};

/**
 * A tiny XML well-formedness check: tags balance, attributes are quoted,
 * entities are known, and no raw < or & sits in text.
 */
function isWellFormed(xml: string): boolean {
  const stack: string[] = [];
  let i = 0;
  let roots = 0;
  const entity = /^&(amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);/;
  while (i < xml.length) {
    const ch = xml.charAt(i);
    if (ch === "<") {
      const end = xml.indexOf(">", i);
      if (end < 0) return false;
      const tag = xml.slice(i + 1, end);
      if (tag.startsWith("/")) {
        if (stack.pop() !== tag.slice(1).trim()) return false;
      } else {
        const selfClosing = tag.endsWith("/");
        const body = selfClosing ? tag.slice(0, -1) : tag;
        const m = /^([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*$/.exec(body);
        if (!m) return false;
        for (const a of (m[2] ?? "").matchAll(/="([^"]*)"/g)) {
          const v = a[1] ?? "";
          for (let k = v.indexOf("&"); k >= 0; k = v.indexOf("&", k + 1)) if (!entity.test(v.slice(k))) return false;
        }
        if (stack.length === 0) roots++;
        if (!selfClosing) stack.push(m[1] ?? "");
      }
      i = end + 1;
    } else if (ch === "&") {
      if (!entity.test(xml.slice(i))) return false;
      i++;
    } else if (ch === ">") {
      return false;
    } else {
      if (stack.length === 0 && ch.trim()) return false;
      i++;
    }
  }
  return stack.length === 0 && roots === 1;
}

describe("escapeXml", () => {
  it("escapes the five special characters", () => {
    expect(escapeXml(`Tom & Jerry <say> "hi" it's`)).toBe("Tom &amp; Jerry &lt;say&gt; &quot;hi&quot; it&apos;s");
  });
  it("drops characters XML cannot hold", () => {
    expect(escapeXml("a\u0000b\u0007c￾d")).toBe("abcd");
  });
  it("keeps the cover well formed with hostile text", () => {
    const svg = buildCoverSvg({ title: `</text><script>alert(1)</script>&nbsp;`, author: `"><img src=x>`, genreId: "wellbeing", badge: "demo" });
    expect(isWellFormed(svg)).toBe(true);
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("<img");
  });
});

describe("wrapLines", () => {
  it("wraps on word boundaries", () => {
    expect(wrapLines("The quiet art of starting again", 14, 4)).toEqual({ lines: ["The quiet art", "of starting", "again"], truncated: false });
  });
  it("splits a word longer than a line", () => {
    expect(wrapLines("Supercalifragilistic", 8, 4).lines).toEqual(["Supercal", "ifragili", "stic"]);
  });
  it("caps lines and ends with an ellipsis", () => {
    const r = wrapLines("one two three four five six seven eight nine ten", 9, 2);
    expect(r.truncated).toBe(true);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[1]?.endsWith("…")).toBe(true);
    expect(r.lines[1]?.length).toBeLessThanOrEqual(9);
  });
  it("normalises whitespace", () => {
    expect(wrapLines("  a\n\tb  ", 10, 2).lines).toEqual(["a b"]);
  });
});

describe("layoutTitle", () => {
  it("uses the largest size for a short title", () => {
    expect(layoutTitle("Worry").size).toBe(64);
  });
  it("never goes past four lines", () => {
    const long = "A Very Long Title About Many Things That Keeps On Going Well Past Any Sensible Length For A Cover Of A Book";
    const t = layoutTitle(long);
    expect(t.lines.length).toBeLessThanOrEqual(4);
    expect(t.lines.at(-1)?.endsWith("…")).toBe(true);
  });
  it("falls back to Untitled", () => {
    expect(layoutTitle("   ").lines).toEqual(["Untitled"]);
  });
});

describe("buildCoverSvg", () => {
  it("styles every genre in the registry and each produces a well-formed 2:3 SVG", () => {
    expect(genres.genres.length).toBeGreaterThan(0);
    for (const g of genres.genres) {
      expect(Object.hasOwn(GENRE_STYLES, g.id), g.id).toBe(true);
      const svg = buildCoverSvg({ title: "Quieting the Noise", author: "Maya Vaughn", genreId: g.id, badge: "official" });
      expect(isWellFormed(svg), g.id).toBe(true);
      expect(svg).toContain(`viewBox="0 0 ${COVER_WIDTH} ${COVER_HEIGHT}"`);
      expect(svg).toContain(GENRE_STYLES[g.id]?.accent ?? "missing");
    }
    expect(COVER_WIDTH * 3).toBe(COVER_HEIGHT * 2);
  });

  it("falls back for an unknown genre", () => {
    expect(isWellFormed(buildCoverSvg({ title: "x", genreId: "nope" }))).toBe(true);
    expect(isWellFormed(buildCoverSvg({ title: "x", genreId: "__proto__" }))).toBe(true);
  });

  it("shows the Demo badge for demo and Public domain for classics", () => {
    expect(buildCoverSvg({ title: "T", author: "A", genreId: "career", badge: "demo" })).toContain(">Demo</text>");
    expect(buildCoverSvg({ title: "T", author: "A", genreId: "career", badge: "public_domain" })).toContain(">Public domain</text>");
    const official = buildCoverSvg({ title: "T", author: "A", genreId: "career", badge: "official" });
    expect(official).not.toContain(">Demo<");
    expect(official).not.toContain(">Public domain<");
  });

  it("includes the author line and alt text, and no outside references", () => {
    const svg = buildCoverSvg({ title: "Meditations", author: "Marcus Aurelius", genreId: "personal_development", badge: "public_domain" });
    expect(svg).toContain(">Marcus Aurelius</text>");
    expect(svg).toContain("<title>Cover of Meditations by Marcus Aurelius</title>");
    expect(svg).not.toMatch(/href=|@import|url\((?!#)/);
  });
});

describe("coverAlt", () => {
  it("names the title and author", () => {
    expect(coverAlt("Meditations", "Marcus Aurelius")).toBe("Cover of Meditations by Marcus Aurelius");
  });
  it("leaves the author out when there is none", () => {
    expect(coverAlt(" Meditations ", "")).toBe("Cover of Meditations");
    expect(coverAlt("", null)).toBe("Cover of Untitled");
  });
});
