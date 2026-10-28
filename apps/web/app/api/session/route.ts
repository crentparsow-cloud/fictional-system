import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Whether anyone is signed in, and nothing else. The public header asks this
 * after the page loads so the pages themselves stay cacheable. The answer is
 * a single boolean: no id, email or name. Never cached.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  let signedIn = false;
  try {
    const supabase = await createUserClient();
    const { data } = await supabase.auth.getUser();
    signedIn = Boolean(data.user);
  } catch {
    signedIn = false;
  }
  return NextResponse.json({ signedIn }, { headers: { "Cache-Control": "no-store, private" } });
}
