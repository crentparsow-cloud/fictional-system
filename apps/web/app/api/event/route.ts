import { NextResponse, type NextRequest } from "next/server";
import { countEvent } from "@/lib/funnel-server";
import { parseClientEvent } from "@/lib/product-events";

/**
 * POST /api/event { event } counts one moment that only the browser sees
 * (the shortcut sheet opened, a referral link copied, an outline made, a
 * grouped search used). The body must be exactly { "event": "<name>" } with a
 * name from CLIENT_EVENTS. Nothing else is read, stored or counted. The
 * visitor's opt-out is honoured by countEvent. Always answers 204 for a good
 * body, so the page learns nothing about whether counting is on.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_CONTENT = { status: 204, headers: { "Cache-Control": "no-store" } } as const;

export async function POST(request: NextRequest) {
  // Only this site's own pages report events.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return new NextResponse(null, { status: 403, headers: { "Cache-Control": "no-store" } });
  if (Number(request.headers.get("content-length") ?? "0") > 200) return new NextResponse(null, { status: 413, headers: { "Cache-Control": "no-store" } });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const event = parseClientEvent(body);
  if (!event) return new NextResponse(null, { status: 400, headers: { "Cache-Control": "no-store" } });
  await countEvent(event);
  return new NextResponse(null, NO_CONTENT);
}
