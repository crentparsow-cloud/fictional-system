import { ImageResponse } from "next/og";
import { CACHE, NO_STORE, OG_SIZE } from "@/lib/cache-headers";
import { brand } from "@/lib/brand";
import { getWorkbookBySlug } from "@/lib/catalogue";
import { COVER_TOKENS, genreStyle } from "@/lib/covers";

/**
 * Open Graph image for a public workbook (10.2, 1.9): /og/<slug>, 1200 by 630.
 * One Satori renderer (next/og), flexbox only, no web fonts loaded, so the
 * bundle stays far under the 500 KB limit. The text is the title and the
 * author's name, as on the page; nothing about the reader and no claim.
 *
 * Read through the user client, so only a public workbook for this host's
 * tenant renders; anything else is a plain 404 that is never stored. The
 * image is the same for every visitor on a host, so it carries the long
 * cover cache header. Cover colours come from lib/covers.
 */
const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/;

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG.test(slug)) return notFound();
  const detail = await getWorkbookBySlug(slug).catch(() => null);
  if (!detail) return notFound();

  const { card } = detail;
  const style = genreStyle(card.genreId);
  const title = card.title.length > 90 ? `${card.title.slice(0, 87)}...` : card.title;
  const author = card.authors.join(" and ");
  const size = title.length > 50 ? 56 : title.length > 28 ? 72 : 88;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: COVER_TOKENS.canvas, color: COVER_TOKENS.ink }}>
        <div style={{ width: 28, height: "100%", background: style.accent, display: "flex" }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", background: style.tint }}>
          <div style={{ display: "flex", fontSize: 30, color: COVER_TOKENS.inkSoft }}>{brand.name}</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: size, fontWeight: 700, lineHeight: 1.1, color: COVER_TOKENS.ink }}>{title}</div>
            {author ? <div style={{ display: "flex", marginTop: 28, fontSize: 36, color: style.accent }}>{author}</div> : null}
          </div>
          <div style={{ display: "flex", fontSize: 28, color: COVER_TOKENS.inkSoft }}>{card.genreName}</div>
        </div>
      </div>
    ),
    { ...OG_SIZE, headers: { "Cache-Control": CACHE.cover } },
  );
}

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": NO_STORE } });
}
