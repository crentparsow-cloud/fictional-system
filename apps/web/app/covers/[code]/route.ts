import { buildCoverSvg, type CoverBadge } from "@/lib/covers";
import { createUserClient } from "@/lib/supabase/server";
import { tenantIdForRequest } from "@/lib/tenant-id";

/**
 * Generated cover for a live workbook (F-117), by AK code. Looked up through
 * the user client, so RLS decides visibility, and scoped to this host's
 * tenant. Anything else is a plain 404.
 *
 * The SVG carries its own strict CSP: no scripts, no outside loads, sandboxed.
 * It uses presentation attributes only, so it needs no style source.
 */
const AK_CODE = /^AK-[0-9A-HJKMNP-TV-Z]{5}$/;

const SVG_CSP = "default-src 'none'; sandbox";

interface CoverRow {
  title: string;
  short_title: string | null;
  genre_id: string;
  badge: CoverBadge;
  books: { book_contributors: { role: string; sort: number; authors: { display_name: string } | null }[] } | null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = raw.replace(/\.svg$/i, "").toUpperCase();
  if (!AK_CODE.test(code)) return notFound();

  const tenantId = await tenantIdForRequest();
  if (!tenantId) return notFound();

  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("workbooks")
    .select("title, short_title, genre_id, badge, books(book_contributors(role, sort, authors(display_name)))")
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

  const svg = buildCoverSvg({ title: data.title, author, genreId: data.genre_id, badge: data.badge });
  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
      "Content-Security-Policy": SVG_CSP,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
