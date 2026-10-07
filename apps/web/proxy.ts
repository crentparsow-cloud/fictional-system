import { NextResponse, type NextRequest } from "next/server";
import { resolveRequestTenant, routeDecision } from "@/lib/tenant-resolve";
import { refreshSession } from "@/lib/supabase/proxy";

/**
 * Host to tenant resolution (F-066) and session refresh (F-132).
 *
 * Reads the request host, works out which tenant it belongs to and passes
 * that down as headers. Admin, studio and console routes are only ever
 * served on the Akana apex. Then the Supabase session is refreshed so Server
 * Components always see a live user, with the cookies kept __Host- scoped.
 *
 * The lookup is the config map by default and tenant_domains when
 * TENANT_DB_LOOKUP=1 (lib/tenant-resolve.ts, docs/TENANT_RESOLUTION.md).
 * Sign-in and the adults-only gate are decided in the (reader) layout, which
 * can read the profile; the proxy only refreshes.
 */
export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const tenant = await resolveRequestTenant(host);
  const path = request.nextUrl.pathname;

  // Unknown host: never fall through to the marketplace. Staff paths on a tenant host: 404.
  if (routeDecision(tenant, path) === "not_found" || !tenant) {
    return new NextResponse("Not found", { status: 404 });
  }

  const headers = new Headers(request.headers);
  headers.set("x-akana-tenant", tenant.slug);
  headers.set("x-akana-tenant-kind", tenant.kind);
  // Only the proxy may set the tenant id. A value sent by the client is dropped.
  if (tenant.id) headers.set("x-akana-tenant-id", tenant.id);
  else headers.delete("x-akana-tenant-id");
  // The path, so a layout can send a reader back where they were heading after a gate.
  headers.set("x-akana-path", path + request.nextUrl.search);

  const { response } = await refreshSession(request, headers);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|fonts/|manifest.webmanifest).*)"],
};
