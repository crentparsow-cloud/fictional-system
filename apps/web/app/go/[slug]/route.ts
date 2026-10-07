import { NextResponse, type NextRequest } from "next/server";
import { getReaderSession } from "@/lib/auth";
import { pickBookLink } from "@/lib/book-link";
import { LAUNCH_MARKETS, isLaunchMarket } from "@/lib/markets";
import { regionFromAcceptLanguage } from "@/lib/support-lines";
import { createUserClient } from "@/lib/supabase/server";

/**
 * /go/<slug>: the "Get the book" link on a workbook's Finish screen (F-017).
 *
 * It sends the reader to the book's store link for their market. Nothing is
 * recorded: no row, no log line, no cookie, and the redirect carries no
 * Referer, so the store never learns which workbook or which reader sent
 * them. Counting taps (as the legacy app did, without knowing who tapped)
 * needs a table and is left for later.
 *
 * Market: ?m= first, then the signed-in reader's profile country, then the
 * region in Accept-Language. The book block is read from the listing section
 * of the workbook's published version, through the caller's own client, so
 * RLS decides what is visible exactly as on the public workbook page.
 */
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" } as const;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const home = new URL("/library", request.nextUrl.origin);
  if (!SLUG.test(slug)) return NextResponse.redirect(home, { status: 302, headers: HEADERS });
  const back = new URL(`/w/${slug}`, request.nextUrl.origin);

  const supabase = await createUserClient();
  const { data: wb } = await supabase.from("workbooks").select("current_version_id").eq("slug", slug).maybeSingle();
  const versionId = (wb?.current_version_id as string | null | undefined) ?? null;
  if (!versionId) return NextResponse.redirect(home, { status: 302, headers: HEADERS });

  const { data: listing } = await supabase
    .from("workbook_sections")
    .select("links:body->book->store_links")
    .eq("version_id", versionId)
    .eq("kind", "listing")
    .maybeSingle();

  const asked = (request.nextUrl.searchParams.get("m") ?? "").toUpperCase();
  let market: string | null = isLaunchMarket(asked) ? asked : null;
  if (!market) {
    const session = await getReaderSession();
    if (session) {
      const { data: profile } = await supabase.from("profiles").select("country").eq("user_id", session.userId).maybeSingle();
      const c = ((profile?.country as string | null | undefined) ?? "").toUpperCase();
      if (isLaunchMarket(c)) market = c;
    }
  }
  market ??= regionFromAcceptLanguage(request.headers.get("accept-language"), LAUNCH_MARKETS);

  const link = pickBookLink((listing as { links?: unknown } | null)?.links, market);
  return NextResponse.redirect(link ? new URL(link) : back, { status: 302, headers: HEADERS });
}
