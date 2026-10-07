import { NextResponse, type NextRequest } from "next/server";
import { signedDownloadUrl } from "@/lib/storage/private-files";

/**
 * Open a private file (F-135). GET /files/open?path=<org id>/<kind>/<id>.<ext>
 * Redirects to a signed URL that lasts 60 seconds, made under the caller's
 * own row level security and audited. Anyone else gets a 404, whether the
 * file exists or not. Never cached, and the path never leaves in a Referer.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = await signedDownloadUrl(request.nextUrl.searchParams.get("path"));
  const res = url ? NextResponse.redirect(url, 303) : NextResponse.json({ error: "not_found" }, { status: 404 });
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}
