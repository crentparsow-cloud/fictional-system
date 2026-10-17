# Edge caching and image budget

Build list item 10.2. Values live in `apps/web/cache-headers.mjs` (typed import: `apps/web/lib/cache-headers.ts`), with tests in `apps/web/lib/cache-headers.test.ts`.

## What is cached, and for how long

Measured on a production build served with `next start` on 14 October 2026.

| Response | Cache-Control | Why |
|---|---|---|
| `/covers/<code>` (generated SVG) | `public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400` | Same for every visitor on a host. Only live titles are served. A 404 is `no-store`. |
| `/og/<slug>` (Open Graph image, 1200 by 630) | same as covers | Same reasons. Added in this pass; the workbook page points at it in `openGraph` and `twitter` metadata. |
| `/icons/*`, `/brand/*` | `public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400` | Unhashed files in `public/`. Next sends `max-age=0, must-revalidate` for these by default. |
| `/sitemap.xml` | `public, max-age=0, s-maxage=3600, stale-while-revalidate=86400` | Built from public data per host. |
| `/fonts/*` | `public, max-age=604800, stale-while-revalidate=86400` | Already set before this pass. |
| Static pages (`/trust`, `/accessibility`, `/legal/*`, `/help/*`, `/public-domain/*`, `/white-label`, `/organisations`) | `s-maxage=31536000` (Next's own default for static pages) | Left alone. Vercel replaces the cached copy on each deploy. |
| Pages that read a session, cookie or token | Not cached | `/pricing`, `/w/[slug]`, `/read`, `/you`, partner and invitation links (`no-store`). |

Vercel's cache key includes the host, so a white-label domain never shares an entry with the marketplace.

## Image transformation budget

Vercel Image Optimization is priced per transformation, one per source image, size and format. Today it costs nothing: the generated covers are SVG and are served as plain images through `components/Cover.tsx`, and no `next/image` call exists. The settings are in place for the day an author supplies a raster cover:

- One format (`image/webp`).
- Sizes from one list: 120, 160, 180, 240, 360 and 480 pixels wide (`COVER_SIZES`). `Cover` rounds any width up to the list.
- `minimumCacheTTL` of one year, so a transformed image is not made twice.
- Device sizes 640 and 1200, quality 75 only.

Ceiling: covers times sizes times formats. For the 190 titles in the catalogue that is 190 x 6 x 1 = 1,140 transformations, once, then cached for a year. A new title adds six. The plan to check on the Vercel pricing page before launch: the free allowance on the plan in use, and that the Hobby plan is non-commercial (research annex Strand 5), so production needs Pro.

Open Graph images are made by `next/og` (Satori) in `app/og/[slug]/route.tsx` on request, not by Image Optimization, so they do not count as transformations. They are cached as above, so each title is rendered about once a month per host.

## Bundle limit for the Open Graph route

Satori allows 500 KB with fonts. The route loads no font file: it uses the font bundled with `next/og`. The repository holds no serif font subset (only Atkinson Hyperlegible Next, Bricolage Grotesque and Lexend, all as woff2, which Satori cannot read). A serif title would need a TTF or OTF subset of an OFL font added to the route. The built route folder is about 96 KB.
