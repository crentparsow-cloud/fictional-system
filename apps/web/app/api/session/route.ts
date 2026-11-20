import { NextResponse } from "next/server";
import { getScopedUser } from "@/lib/session-scope-server";

/**
 * Whether anyone is signed in, and nothing else. The public header asks this
 * after the page loads so the pages themselves stay cacheable. The answer is
 * a single boolean: no id, email or name. Never cached.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  let signedIn = false;
  try {
    // F-133: a session that does not belong on this host is nobody.
    signedIn = Boolean(await getScopedUser());
  } catch {
    signedIn = false;
  }
  return NextResponse.json({ signedIn }, { headers: { "Cache-Control": "no-store, private" } });
}
