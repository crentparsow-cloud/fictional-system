import { ImageResponse } from "next/og";
import { buildCoverSvg, type CoverBadge } from "@/lib/covers";
import { activeDirection } from "@/lib/design/active";
import { coverFonts } from "@/lib/design/cover-fonts";
import { CoverArt } from "@/lib/design/cover-render";
import { COVER_UNITS, coverFormat, formatLabel, previewLine, shelfForCover, snapPngWidth, type CoverSpec } from "@/lib/design/cover-spec";
import { createUserClient } from "@/lib/supabase/server";
import { tenantIdForRequest } from "@/lib/tenant-id";
import { CACHE, NO_STORE } from "@/lib/cache-headers";

/**
 * Generated cover for a live workbook (F-117), by AK code.
 *
 *   /covers/AK-12345.png?w=240   the format-coded cover (plan 1.2) from the
 *                                Satori renderer shared with /og/<slug>, in
 *                                the active design direction. The width snaps
 *                                to one of four sizes (lib/design/cover-spec),
 *                                so the cache holds at most four images a title.
 *   /covers/AK-12345 or .svg     the older SVG cover, unchanged.
 *
 * Looked up through
 * the user client, so RLS decides visibility, and scoped to this host's
 * tenant. Anything else is a plain 404.
 *
 * The SVG carries its own strict CSP: no scripts, no outside loads, sandboxed.
 * It uses presentation attributes only, so it needs no style source.
 *
 * Cached for a day in the browser and a month at the edge (10.2). Only live
 * workbooks are served, so the body is the same for every visitor on a host.
 * A 404 is never stored.
 */
const AK_CODE = /^AK-[0-9A-HJKMNP-TV-Z]{5}$/;

const SVG_CSP = "default-src 'none'; sandbox";

interface CoverRow {
  title: string;
  short_title: string | null;
  genre_id: string;
  badge: CoverBadge;
  card_line: string | null;
  current_version_id: string | null;
  books: { book_contributors: { role: string; sort: number; authors: { display_name: string } | null }[] } | null;
}

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const wantsPng = /\.png$/i.test(raw);
  const code = raw.replace(/\.(svg|png)$/i, "").toUpperCase();
  if (!AK_CODE.test(code)) return notFound();

  const tenantId = await tenantIdForRequest();
  if (!tenantId) return notFound();

  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("workbooks")
    .select("title, short_title, genre_id, badge, card_line, current_version_id, books(book_contributors(role, sort, authors(display_name)))")
    .eq("code", code)
    .eq("status", "live")
    .eq("tenant_id", tenantId)
    .maybeSingle<CoverRow>();
  if (error) console.error("cover_lookup_failed", error.code ?? "");
  if (!data) return notFound();

  const author = (data.books?.book_contributors ?? [])
    .filter((c) => c.role === "author" && c.authors?.display_name)
    .sort((a, b) => a.sort - b.sort)
    .map((c) => c.authors!.display_name)
    .join(" and ");

  if (wantsPng) {
    const width = snapPngWidth(Number(new URL(request.url).searchParams.get("w")) || COVER_UNITS.defaultWidth);
    const format = await listingFormat(supabase, data.current_version_id);
    const spec: CoverSpec = {
      format: coverFormat(format),
      label: formatLabel(format),
      title: data.title,
      author,
      preview: previewLine(data.card_line),
      shelfId: shelfForCover(null, data.genre_id),
    };
    return new ImageResponse(<CoverArt spec={spec} direction={activeDirection} width={width} />, {
      width,
      height: Math.round((width * COVER_UNITS.h) / COVER_UNITS.w),
      fonts: coverFonts(activeDirection),
      headers: { "Cache-Control": CACHE.cover },
    });
  }

  const svg = buildCoverSvg({ title: data.title, author, genreId: data.genre_id, badge: data.badge });
  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": CACHE.cover,
      "Content-Security-Policy": SVG_CSP,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Programme length from the published listing, the same path the catalogue reads. No length means a plain "Workbook" cover. */
async function listingFormat(supabase: Awaited<ReturnType<typeof createUserClient>>, versionId: string | null) {
  const none = { unitCount: null, unitKind: null } as const;
  if (!versionId) return none;
  const { data } = await supabase
    .from("workbook_sections")
    .select("count:body->structure->count, unit:body->structure->>unit")
    .eq("version_id", versionId)
    .eq("kind", "listing")
    .maybeSingle<{ count: unknown; unit: unknown }>();
  const unit = data?.unit;
  return {
    unitCount: typeof data?.count === "number" && Number.isFinite(data.count) ? data.count : null,
    unitKind: unit === "week" || unit === "day" || unit === "module" || unit === "chapter" || unit === "part" ? unit : null,
  } as const;
}

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": NO_STORE },
  });
}
