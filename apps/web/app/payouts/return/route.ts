import { NextResponse, type NextRequest } from "next/server";
import { syncOrganisationFromStripe } from "@/lib/payouts/connect";
import { isUuid } from "@/lib/payouts/status";

/**
 * Stripe's return_url after Express onboarding (F-099). GET
 * /payouts/return?org=<id>. Reads the account fresh and updates the status
 * so the page is right straight away; the account.updated webhook does the
 * same later. Changes nothing a visitor controls: the read runs under the
 * caller's own row level security, so a stranger's org id does nothing.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const org = request.nextUrl.searchParams.get("org") ?? "";
  if (isUuid(org)) await syncOrganisationFromStripe(org);
  const to = new URL(`/payouts${isUuid(org) ? `?org=${org}&done=1` : ""}`, request.nextUrl.origin);
  const res = NextResponse.redirect(to, 303);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
