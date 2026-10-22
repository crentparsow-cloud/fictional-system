import { NextResponse, type NextRequest } from "next/server";
import { isOneClickUnsubscribeRequest } from "@akana/emails";
import { isNewsletterToken } from "@/lib/newsletter";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * One-click unsubscribe (RFC 8058) for the newsletter (6.11). The mail
 * client POSTs "List-Unsubscribe=One-Click" to the address in the
 * List-Unsubscribe header. Only that POST unsubscribes anyone. A GET, which
 * a mail scanner or a person may send, changes nothing and goes to the page
 * with the button.
 *
 *   POST /api/newsletter/unsubscribe?t=<token>   body: List-Unsubscribe=One-Click
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t");
  const body = await request.text().catch(() => "");
  if (!isOneClickUnsubscribeRequest(request.method, body) || !isNewsletterToken(token)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400, headers: NO_STORE });
  }
  try {
    const { data, error } = await createAdminClient().rpc("newsletter_unsubscribe", { p_token: token });
    if (error) {
      console.error("newsletter_unsubscribe_failed", error.code ?? "unknown");
      return NextResponse.json({ error: "failed" }, { status: 500, headers: NO_STORE });
    }
    return NextResponse.json({ unsubscribed: data === true }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });
  }
}

export function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t");
  const to = new URL(isNewsletterToken(token) ? `/newsletter/unsubscribe?t=${token}` : "/newsletter", request.url);
  return NextResponse.redirect(to, { status: 303, headers: NO_STORE });
}
