import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath, sameOriginUrl } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Magic link landing (F-132). Exchanges the code for a session, which writes
 * the __Host- cookies through the user client, then sends the reader on.
 * The (reader) layout decides whether /welcome comes first.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));
  if (code) {
    // A code this browser has no verifier for (one opened on another device)
    // must end at the sign-in page with its plain message, never in an error page.
    try {
      const supabase = await createUserClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(sameOriginUrl(next, url.origin));
    } catch {
      console.error("auth_callback_exchange_failed");
    }
  }
  return NextResponse.redirect(new URL(`/sign-in?error=link&next=${encodeURIComponent(next)}`, url.origin));
}
