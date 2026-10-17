import { ImageResponse } from "next/og";
import { CACHE, NO_STORE, OG_SIZE } from "@/lib/cache-headers";
import { brand } from "@/lib/brand";
import { getWorkbookBySlug } from "@/lib/catalogue";
import { activeDirection } from "@/lib/design/active";
import { coverFonts } from "@/lib/design/cover-fonts";
import { ShareImage } from "@/lib/design/cover-render";
import { coverFormat, formatLabel, previewLine, shelfForCover, type CoverSpec } from "@/lib/design/cover-spec";

/**
 * Open Graph image for a public workbook (10.2, 1.9): /og/<slug>, 1200 by 630.
 * The same Satori renderer as the covers (lib/design/cover-render): the
 * format-coded cover on the left, the title, author and one line of preview
 * on the right, in the active design direction. Only the subset faces in
 * lib/design/og-fonts are loaded, about 40 KB, so the bundle stays far under
 * the 500 KB limit. Nothing about the reader and no claim.
 *
 * Read through the user client, so only a public workbook for this host's
 * tenant renders; anything else is a plain 404 that is never stored. The
 * image is the same for every visitor on a host, so it carries the long
 * cover cache header.
 */
const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/;

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG.test(slug)) return notFound();
  const detail = await getWorkbookBySlug(slug).catch(() => null);
  if (!detail) return notFound();

  const { card } = detail;
  const format = { unitCount: card.unitCount, unitKind: card.unitKind };
  const spec: CoverSpec = {
    format: coverFormat(format),
    label: formatLabel(format),
    title: card.title,
    author: card.authors.join(" and "),
    preview: previewLine(card.cardLine),
    shelfId: shelfForCover(card.shelfId, card.genreId),
  };

  return new ImageResponse(<ShareImage spec={spec} direction={activeDirection} brandName={brand.name} />, {
    ...OG_SIZE,
    fonts: coverFonts(activeDirection),
    headers: { "Cache-Control": CACHE.cover },
  });
}

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": NO_STORE } });
}
