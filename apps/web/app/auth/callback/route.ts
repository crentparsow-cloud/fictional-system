import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth";
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
    const supabase = await createUserClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL(`/sign-in?error=link&next=${encodeURIComponent(next)}`, url.origin));
}
