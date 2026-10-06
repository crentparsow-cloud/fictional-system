import { NextResponse, type NextRequest } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import { refreshSession } from "@/lib/supabase/proxy";

/**
 * Host to tenant resolution (F-066, first cut) and session refresh (F-132).
 *
 * Reads the request host, works out which tenant it belongs to and passes
 * that down as a header. Admin, studio and console routes are only ever
 * served on the Akana apex. Then the Supabase session is refreshed so Server
 * Components always see a live user, with the cookies kept __Host- scoped.
 *
 * Tenant lookup is a config read today. Edge Config and the tenant_domains
 * table replace it in week 2. Sign-in and the adults-only gate are decided in
 * the (reader) layout, which can read the profile; the proxy only refreshes.
 */
export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const tenant = resolveTenant(host);
  const path = request.nextUrl.pathname;

  if (!tenant) {
    // Unknown host: never fall through to the marketplace.
    return new NextResponse("Not found", { status: 404 });
  }

  const staffOnlyOnApex = /^\/(admin|studio|console)(\/|$)/.test(path);
  if (staffOnlyOnApex && tenant.kind !== "marketplace") {
    return new NextResponse("Not found", { status: 404 });
  }

  const headers = new Headers(request.headers);
  headers.set("x-akana-tenant", tenant.slug);
  headers.set("x-akana-tenant-kind", tenant.kind);
  // The path, so a layout can send a reader back where they were heading after a gate.
  headers.set("x-akana-path", path + request.nextUrl.search);

  const { response } = await refreshSession(request, headers);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|fonts/|manifest.webmanifest).*)"],
};
