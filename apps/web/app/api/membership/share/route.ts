import { NextResponse, type NextRequest } from "next/server";
import { getReaderSession } from "@/lib/auth";
import { NO_STORE } from "@/lib/enrolment";
import { inviteShareText } from "@/lib/shared-membership";
import { hashInviteToken, inviteUrl, newInviteToken } from "@/lib/shared-membership-token";
import { createUserClient } from "@/lib/supabase/server";
import { tenantIdForRequest } from "@/lib/tenant-id";

/**
 * Make or refresh the invitation for the second place on a two-person
 * membership (item 6.1). POST /api/membership/share -> { url, text }.
 *
 * The server makes the token and stores only its hash (migration 0041). The
 * link goes back to the buyer, who copies it or uses their own share sheet.
 * Akana sends nothing to the invitee. Asking again replaces an unused link,
 * and the old one stops working. The database refuses when the caller has no
 * two-person membership, when it is ending, or when the place is taken.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REFUSALS: Record<string, { status: number; error: string }> = {
  AKS01: { status: 401, error: "Sign in to share your membership." },
  AKS02: { status: 409, error: "Sharing is for the membership for two people." },
  AKS03: { status: 409, error: "Your membership is ending, so it cannot take a new person." },
  AKS04: { status: 409, error: "Your second place is already taken. Remove them first if you want to invite someone else." },
};

export async function POST(request: NextRequest) {
  const session = await getReaderSession();
  if (!session) return NextResponse.json({ error: "Sign in to share your membership." }, { status: 401, headers: NO_STORE });
  const tenantId = await tenantIdForRequest();
  if (!tenantId) return NextResponse.json({ error: "Unknown storefront." }, { status: 404, headers: NO_STORE });

  const token = newInviteToken();
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("seat_create_invite", { p_token_hash: hashInviteToken(token), p_tenant: tenantId });
  if (error) {
    const known = REFUSALS[error.code ?? ""];
    if (known) return NextResponse.json({ error: known.error }, { status: known.status, headers: NO_STORE });
    console.error("seat_invite_failed", { code: error.code });
    return NextResponse.json({ error: "Could not make the link just now. Please try again." }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ url: inviteUrl(siteOrigin(request), token), text: inviteShareText() }, { headers: NO_STORE });
}

/** The public origin for the link, from the proxy's headers. */
function siteOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? process.env.AKANA_HOST ?? "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
