import { NextResponse, type NextRequest } from "next/server";
import { isUuid } from "@/lib/payouts/status";

/**
 * Stripe's refresh_url (F-099): the onboarding link expired or was used.
 * A new link needs a POST and a recent authenticator code, so this only
 * sends the person back to /payouts to press the button again.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const org = request.nextUrl.searchParams.get("org") ?? "";
  const to = new URL(`/payouts?${isUuid(org) ? `org=${org}&` : ""}expired=1`, request.nextUrl.origin);
  const res = NextResponse.redirect(to, 303);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
