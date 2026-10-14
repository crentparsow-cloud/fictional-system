/**
 * Cache headers and image sizes (10.2). The values live in cache-headers.mjs so
 * next.config.ts can read them too; this file gives routes and components a
 * typed import. See docs/EDGE_CACHING.md.
 */
export { CACHE, COVER_SIZES, IMAGE_CONFIG, NO_STORE, OG_SIZE, TTL, cacheHeaderRules, publicCache, snapCoverWidth, transformationCeiling } from "../cache-headers.mjs";
