import { NextResponse, type NextRequest } from "next/server";
import { isTenantSiteInternalPath, proxyRequestHeaders, resolveRequestTenant, routeDecision, tenantSiteRoute } from "@/lib/tenant-resolve";
import { refreshSession } from "@/lib/supabase/proxy";

/**
 * Host to tenant resolution (F-066) and session refresh (F-132).
 *
 * Reads the request host, works out which tenant it belongs to and passes
 * that down as headers. Admin, studio and console routes are only ever
 * served on the Akana apex. A white-label host gets its tenant site and
 * Akana's locked pages, nothing else (lib/tenant-resolve.ts tenantSiteRoute). Then the Supabase session is refreshed so Server
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

  // Only the proxy may set x-akana-* headers. Anything the client sent with that prefix is dropped (L4).
  const headers = proxyRequestHeaders(request.headers, tenant, path + request.nextUrl.search);

  // A white-label host serves the tenant site and Akana's locked pages only
  // (F-068, F-069). No session lives on a tenant host, because sign-in stays
  // on the Akana apex, so there is nothing to refresh.
  if (tenant.kind === "white_label") {
    const site = tenantSiteRoute(path);
    if (site.action === "not_found") return new NextResponse("Not found", { status: 404 });
    if (site.action === "rewrite") {
      const url = request.nextUrl.clone();
      url.pathname = site.to;
      return NextResponse.rewrite(url, { request: { headers } });
    }
    return NextResponse.next({ request: { headers } });
  }
  // The tenant site's own pages exist only behind that rewrite.
  if (isTenantSiteInternalPath(path)) return new NextResponse("Not found", { status: 404 });

  const { response } = await refreshSession(request, headers);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|fonts/|manifest.webmanifest).*)"],
};
