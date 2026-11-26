import { NextResponse, type NextRequest } from "next/server";
import { countEvent } from "@/lib/funnel-server";
import { clientIp } from "@/lib/leads";
import { eventAllowed } from "@/lib/limits";
import { parseClientEvent } from "@/lib/product-events";

/**
 * POST /api/event { event } counts one moment that only the browser sees
 * (the shortcut sheet opened, a referral link copied, an outline made, a
 * grouped search used). The body must be exactly { "event": "<name>" } with a
 * name from CLIENT_EVENTS. Nothing else is read, stored or counted. The
 * visitor's opt-out is honoured by countEvent. Always answers 204 for a good
 * body, so the page learns nothing about whether counting is on. One address
 * may send 300 in ten minutes (lib/limits.ts eventAllowed); after that 429.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_CONTENT = { status: 204, headers: { "Cache-Control": "no-store" } } as const;

export async function POST(request: NextRequest) {
  // Only this site's own pages report events.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return new NextResponse(null, { status: 403, headers: { "Cache-Control": "no-store" } });
  if (Number(request.headers.get("content-length") ?? "0") > 200) return new NextResponse(null, { status: 413, headers: { "Cache-Control": "no-store" } });
  // Review M5: a generous limit per address, held in memory. Over it, nothing is counted.
  if (!eventAllowed("event", clientIp(request.headers))) return new NextResponse(null, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "600" } });
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
