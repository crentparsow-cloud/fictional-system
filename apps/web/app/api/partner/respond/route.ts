import { isOneClickUnsubscribeRequest } from "@akana/emails";
import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginPost, isTokenShaped, originFrom, PARTNER_HEADERS, parseRespondAction } from "@/lib/partner";
import { respondToLink } from "@/lib/partner-flow";
import { createPartnerMail, mailerEnvFromProcess } from "@/lib/partner-mail";
import { createRateLimiter } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * A check-in partner acts on an email link (F-030). No account: the token
 * is the key, and it only ever does the one thing it was minted for.
 *
 *   Form POST from /respond/[token] (same origin): t, a, and for a reply the
 *   message. Then 303 back to the page with the outcome word.
 *
 *   One-click stop from a mail app (RFC 8058): POST to
 *   ?a=stop&t=<token> with the body List-Unsubscribe=One-Click. Acts at once
 *   and answers 200. A GET to this route does nothing at all, so a link
 *   scanner opening URLs cannot act for anyone.
 *
 * Responses are never cached or indexed and send no referrer. The token is
 * never logged.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Slows anyone trying tokens at random. Tokens are 256 bits, so this is belt and braces. */
const limiter = createRateLimiter({ limit: 30, windowMs: 10 * 60 * 1000 });

export async function GET() {
  return new NextResponse("Use the button on the page.", { status: 405, headers: { ...PARTNER_HEADERS, Allow: "POST" } });
}

export async function POST(request: NextRequest) {
  const origin = originFrom(request.headers);
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || "local";
  const raw = await request.text().catch(() => "");
  const q = request.nextUrl.searchParams;

  // One-click stop from a mail client.
  if (q.get("a") === "stop" && isOneClickUnsubscribeRequest("POST", raw)) {
    const t = q.get("t");
    if (!isTokenShaped(t) || !limiter.hit(ip)) return NextResponse.json({ ok: false }, { status: 400, headers: PARTNER_HEADERS });
    const r = await act(t, "stop", null, origin);
    return NextResponse.json({ ok: r.outcome === "stopped" || r.outcome === "already" }, { headers: PARTNER_HEADERS });
  }

  if (!isSameOriginPost(request.headers)) return new NextResponse("Forbidden", { status: 403, headers: PARTNER_HEADERS });
  const form = new URLSearchParams(raw);
  const t = form.get("t");
  const action = parseRespondAction(form.get("a"));
  if (!isTokenShaped(t) || !action) return NextResponse.redirect(`${origin}/respond/invalid`, { status: 303, headers: PARTNER_HEADERS });
  if (!limiter.hit(ip)) return NextResponse.redirect(`${origin}/respond/${t}?done=failed`, { status: 303, headers: PARTNER_HEADERS });

  const r = await act(t, action, form.get("message"), origin);
  return NextResponse.redirect(`${origin}/respond/${t}?done=${r.outcome}`, { status: 303, headers: PARTNER_HEADERS });
}

async function act(token: string, action: Parameters<typeof respondToLink>[1], message: string | null, origin: string) {
  try {
    const admin = createAdminClient();
    const mail = createPartnerMail({ env: mailerEnvFromProcess(), origin });
    return await respondToLink(token, action, message, { rpc: (fn, args) => admin.rpc(fn, args), mail });
  } catch (e) {
    console.error("partner_respond_failed", e instanceof Error ? e.name : "unknown");
    return { outcome: "failed" as const, readerName: "" };
  }
}
