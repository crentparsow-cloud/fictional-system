import { describe, expect, it } from "vitest";
import {
  CACHE,
  COVER_SIZES,
  IMAGE_CONFIG,
  NO_STORE,
  OG_SIZE,
  TTL,
  cacheHeaderRules,
  publicCache,
  snapCoverWidth,
  transformationCeiling,
} from "./cache-headers";

describe("publicCache (10.2)", () => {
  it("builds a header with browser, edge and stale lifetimes", () => {
    expect(publicCache({ browser: 60, edge: 600, stale: 3600 })).toBe("public, max-age=60, s-maxage=600, stale-while-revalidate=3600");
  });

  it("leaves out stale-while-revalidate when it is zero", () => {
    expect(publicCache({ browser: 0, edge: 60 })).toBe("public, max-age=0, s-maxage=60");
  });

  it("rejects negative or fractional lifetimes", () => {
    expect(() => publicCache({ browser: -1, edge: 60 })).toThrow(/browser/);
    expect(() => publicCache({ browser: 0, edge: 1.5 })).toThrow(/edge/);
    expect(() => publicCache({ browser: 0, edge: 60, stale: Number.NaN })).toThrow(/stale/);
  });

  it("keeps covers longer at the edge than in the browser, and never private or no-store", () => {
    expect(CACHE.cover).toContain(`s-maxage=${TTL.month}`);
    expect(CACHE.cover).toContain(`max-age=${TTL.day}`);
    for (const v of Object.values(CACHE)) {
      expect(v.startsWith("public")).toBe(true);
      expect(v).not.toMatch(/no-store|private/);
    }
    expect(NO_STORE).toMatch(/no-store/);
  });
});

describe("cover sizes", () => {
  it("keeps the list short and ascending", () => {
    expect(COVER_SIZES.length).toBeLessThanOrEqual(6);
    expect([...COVER_SIZES].sort((a, b) => a - b)).toEqual([...COVER_SIZES]);
  });

  it("snaps any width up to a listed size, and to the largest beyond the list", () => {
    expect(snapCoverWidth(100)).toBe(120);
    expect(snapCoverWidth(120)).toBe(120);
    expect(snapCoverWidth(121)).toBe(160);
    expect(snapCoverWidth(170)).toBe(180);
    expect(snapCoverWidth(9999)).toBe(COVER_SIZES.at(-1));
    expect(snapCoverWidth(Number.NaN)).toBe(COVER_SIZES[0]);
    expect(snapCoverWidth(0)).toBe(COVER_SIZES[0]);
  });

  it("hands next/image the same list, one format and a one year minimum TTL", () => {
    expect(IMAGE_CONFIG.imageSizes).toEqual([...COVER_SIZES]);
    expect(IMAGE_CONFIG.formats).toHaveLength(1);
    expect(IMAGE_CONFIG.minimumCacheTTL).toBe(TTL.year);
  });

  it("bounds transformations at covers times sizes times formats", () => {
    expect(transformationCeiling(190)).toBe(190 * COVER_SIZES.length);
    expect(transformationCeiling(0)).toBe(0);
  });
});

describe("cacheHeaderRules", () => {
  it("covers only public, host-wide paths", () => {
    const rules = cacheHeaderRules();
    expect(rules.map((r) => r.source)).toEqual(["/icons/:path*", "/brand/:path*", "/sitemap.xml"]);
    for (const r of rules) expect(r.headers).toEqual([{ key: "Cache-Control", value: expect.stringMatching(/^public, /) }]);
    // Nothing that reads a session or a token is listed.
    for (const r of rules) expect(r.source).not.toMatch(/respond|files|api|admin|studio|org|read|sign-in|account/);
  });

  it("uses the 1200 by 630 Open Graph size", () => {
    expect(OG_SIZE).toEqual({ width: 1200, height: 630 });
  });
});
