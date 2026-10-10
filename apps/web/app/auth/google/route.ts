import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth";
import { googleClientId, looksLikeIdToken, looksLikeNonce, postedFromThisSite } from "@/lib/google-signin";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Google One Tap landing (13.1). The client posts the ID token Google issued
 * and the nonce it was minted for. Supabase Auth checks the token's
 * signature, audience and nonce (signInWithIdToken) and writes the __Host-
 * cookies through the user client, then the reader goes on. The (reader)
 * layout decides whether /welcome comes first.
 *
 * Account linking: Supabase links a Google identity to the existing account
 * with the same verified email, so a reader who signed up by magic link and
 * later taps Google lands in the same account (docs/AUTH.md).
 *
 * With NEXT_PUBLIC_GOOGLE_CLIENT_ID blank the route answers 404, like the
 * rest of One Tap.
 */
export async function POST(request: NextRequest) {
  if (!googleClientId()) return new NextResponse("Not found", { status: 404 });
  const url = request.nextUrl;
  const form = await request.formData().catch(() => null);
  const next = safeNextPath(typeof form?.get("next") === "string" ? String(form.get("next")) : null);
  const back = (error: string) => NextResponse.redirect(new URL(`/sign-in?error=${error}&next=${encodeURIComponent(next)}`, url.origin), 303);

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!form || !postedFromThisSite(request.headers, host)) return back("google");
  const credential = form.get("credential");
  const nonce = form.get("nonce");
  if (!looksLikeIdToken(credential) || !looksLikeNonce(nonce)) return back("google");

  const supabase = await createUserClient();
  const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: credential, nonce });
  if (error) {
    console.error("sign_in_google_failed", error.status ?? "", error.code ?? error.name);
    return back("google");
  }
  return NextResponse.redirect(new URL(next, url.origin), 303);
}
