import { isOneClickUnsubscribeRequest } from "@akana/emails";
import { NextResponse, type NextRequest } from "next/server";
import { hashToken, isSameOriginPost, isTokenShaped, originFrom, PARTNER_HEADERS } from "@/lib/partner";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Stop the marketing emails (win-back). No sign-in: the token in the link is
 * the key, and it was made for one reader when the message was sent.
 *
 *   Form POST from /unsubscribe/[token] (same origin): t. Then 303 back to
 *   the page with the outcome.
 *
 *   One-click from a mail app (RFC 8058): POST to ?t=<token> with the body
 *   List-Unsubscribe=One-Click. Acts at once and answers 200.
 *
 * A GET does nothing at all, so a link scanner opening URLs stops nobody's
 * emails. Never cached or indexed, and the token is never logged.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return new NextResponse("Use the button on the page.", { status: 405, headers: { ...PARTNER_HEADERS, Allow: "POST" } });
}

async function stop(token: string): Promise<boolean> {
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase.rpc("marketing_unsubscribe", { p_token_hash: await hashToken(token) });
    return !error && data === true;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const raw = await request.text().catch(() => "");
  const q = request.nextUrl.searchParams;
  const origin = originFrom(request.headers);

  const oneClickToken = q.get("t");
  if (oneClickToken && isOneClickUnsubscribeRequest("POST", raw)) {
    const ok = isTokenShaped(oneClickToken) && (await stop(oneClickToken));
    return NextResponse.json({ ok }, { status: ok ? 200 : 400, headers: PARTNER_HEADERS });
  }

  if (!isSameOriginPost(request.headers)) return new NextResponse("Forbidden", { status: 403, headers: PARTNER_HEADERS });
  const t = new URLSearchParams(raw).get("t");
  if (!isTokenShaped(t)) return NextResponse.redirect(`${origin}/unsubscribe/invalid?done=failed`, { status: 303, headers: PARTNER_HEADERS });
  const ok = await stop(t);
  return NextResponse.redirect(`${origin}/unsubscribe/${t}?done=${ok ? "1" : "failed"}`, { status: 303, headers: PARTNER_HEADERS });
}
