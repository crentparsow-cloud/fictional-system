import { NextResponse, type NextRequest } from "next/server";
import { isTenantSiteInternalPath, resolveRequestTenant, routeDecision, tenantSignInEnabled, tenantSiteRoute } from "@/lib/tenant-resolve";
import { normaliseHost } from "@/lib/tenant";
import { refreshSession, stripSessionCookies } from "@/lib/supabase/proxy";

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
 *
 * Session scope (F-133): the refresh also checks that the session belongs
 * on this host. A tenant-scoped session is removed on the marketplace; on a
 * tenant host only that tenant's own scoped session is let through, and only
 * to the reader routes. docs/TENANT_SIGN_IN.md.
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

  // Only the proxy may set these two. Values sent by the client are dropped.
  headers.delete("x-akana-tenant-host");
  headers.delete("x-akana-tenant-sign-in");

  // A white-label host serves the tenant site and Akana's locked pages only
  // (F-068, F-069). With reader sign-in on for the tenant (F-133) it also
  // serves the reader routes, and only those ever see a session.
  if (tenant.kind === "white_label") {
    const signIn = await tenantSignInEnabled(tenant);
    const site = tenantSiteRoute(path, { signIn });
    if (site.action === "not_found") return new NextResponse("Not found", { status: 404 });
    // The host as resolved, for links that leave the server (L02). Never the raw header.
    headers.set("x-akana-tenant-host", normaliseHost(host));
    if (signIn) headers.set("x-akana-tenant-sign-in", "1");
    const url = site.action === "rewrite" ? request.nextUrl.clone() : undefined;
    if (url && site.action === "rewrite") url.pathname = site.to;
    if (site.session) {
      const { response } = await refreshSession(request, headers, { kind: "white_label", tenantId: tenant.id }, url);
      return response;
    }
    // The catalogue and the locked pages never see a session.
    stripSessionCookies(request, headers);
    if (url) return NextResponse.rewrite(url, { request: { headers } });
    return NextResponse.next({ request: { headers } });
  }
  // The tenant site's own pages exist only behind that rewrite.
  if (isTenantSiteInternalPath(path)) return new NextResponse("Not found", { status: 404 });

  const { response } = await refreshSession(request, headers, { kind: "marketplace", tenantId: tenant.id });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|fonts/|manifest.webmanifest).*)"],
};
