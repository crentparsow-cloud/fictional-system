/**
 * Cache headers and image sizes (10.2). Plain JavaScript with JSDoc, like
 * csp.mjs, so next.config.ts and the route handlers use the same values and a
 * test can read them without Next.
 *
 * Rules:
 * - Only responses that are the same for every visitor on a host get a public
 *   cache header. Anything that reads a session, a cookie or a token never does.
 * - Vercel's CDN keys on the host, so a white-label host never shares an entry
 *   with the marketplace.
 * - Image sizes come from one short list. Vercel prices each image
 *   transformation (source image, size, format), so the monthly count stays
 *   near covers times sizes. docs/EDGE_CACHING.md has the budget.
 */

const DAY = 86400;

/** Seconds, named so a header reads as a sentence. */
export const TTL = Object.freeze({
  hour: 3600,
  day: DAY,
  week: 7 * DAY,
  month: 30 * DAY,
  year: 365 * DAY,
});

/**
 * Build a Cache-Control value for a response every visitor on this host gets.
 * `browser` is max-age, `edge` is s-maxage, `stale` is stale-while-revalidate.
 *
 * @param {{ browser: number, edge: number, stale?: number }} ttl
 * @returns {string}
 */
export function publicCache({ browser, edge, stale = 0 }) {
  for (const [name, v] of Object.entries({ browser, edge, stale })) {
    if (!Number.isInteger(v) || v < 0) throw new Error(`cache ${name} must be a whole number of seconds`);
  }
  const parts = ["public", `max-age=${browser}`, `s-maxage=${edge}`];
  if (stale > 0) parts.push(`stale-while-revalidate=${stale}`);
  return parts.join(", ");
}

/** Never stored by a browser or the CDN. Used for 404s, tokens and anything personal. */
export const NO_STORE = "no-store, max-age=0";

/** Named presets. */
export const CACHE = Object.freeze({
  /** Generated covers and Open Graph images: change only when a title's text changes. */
  cover: publicCache({ browser: TTL.day, edge: TTL.month, stale: TTL.day }),
  /** Unhashed files in public/ (icons, brand): a week at the edge, a day in the browser. */
  asset: publicCache({ browser: TTL.day, edge: TTL.week, stale: TTL.day }),
  /** Per-host listings built from public data, such as the sitemap. */
  listing: publicCache({ browser: 0, edge: TTL.hour, stale: TTL.day }),
});

/**
 * The only cover widths, in CSS pixels. A cover is 2:3, so these are also the
 * widths of every raster variant. Twice the card size covers a 2x screen.
 */
export const COVER_SIZES = Object.freeze([120, 160, 180, 240, 360, 480]);

/**
 * Round a requested width up to the nearest listed size, or the largest.
 * @param {number} width
 * @returns {number}
 */
export function snapCoverWidth(width) {
  const w = Number.isFinite(width) ? width : 0;
  return COVER_SIZES.find((s) => s >= w) ?? COVER_SIZES[COVER_SIZES.length - 1] ?? 480;
}

/** Open Graph image size. */
export const OG_SIZE = Object.freeze({ width: 1200, height: 630 });

/**
 * Settings for next/image, for raster covers if an author supplies one.
 * The generated covers are SVG and do not pass through it at all.
 * Two formats would double the transformation count, so there is one.
 */
export const IMAGE_CONFIG = Object.freeze({
  formats: ["image/webp"],
  imageSizes: [...COVER_SIZES],
  deviceSizes: [640, 1200],
  qualities: [75],
  minimumCacheTTL: TTL.year,
});

/**
 * Upper bound on transformations in a month: every cover at every listed
 * size in the one format. Real use is lower, because only sizes a page asks for are made.
 */
export function transformationCeiling(covers) {
  return covers * COVER_SIZES.length * IMAGE_CONFIG.formats.length;
}

/**
 * Header rules for next.config.ts `headers()`.
 * @returns {{ source: string, headers: { key: string, value: string }[] }[]}
 */
export function cacheHeaderRules() {
  const cc = (value) => [{ key: "Cache-Control", value }];
  return [
    { source: "/icons/:path*", headers: cc(CACHE.asset) },
    { source: "/brand/:path*", headers: cc(CACHE.asset) },
    { source: "/sitemap.xml", headers: cc(CACHE.listing) },
  ];
}
