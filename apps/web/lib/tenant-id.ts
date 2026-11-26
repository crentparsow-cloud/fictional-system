import "server-only";
import { headers } from "next/headers";
import { DEMO_TENANT_ID, DEMO_TENANT_SLUG, MARKETPLACE_TENANT_ID } from "@/lib/tenant";
import { resolveRequestTenant, type HostTenant } from "@/lib/tenant-resolve";

/**
 * The tenant for the current request.
 *
 * Review L4. The proxy resolves the host and passes x-akana-tenant (slug),
 * x-akana-tenant-kind and x-akana-tenant-id down as request headers. Those
 * headers are only trustworthy on routes the proxy matcher covers. The
 * matcher skips /icons/, /fonts/ and a few other static paths, and a server
 * action can be posted to any path, so a request there could carry forged
 * tenant headers that nothing had stripped.
 *
 * Two fixes were possible. Widening the matcher would send every icon and
 * font through the proxy, with a session refresh each time, and a tenant
 * host would need new allow rules for them. A marker header cannot be made
 * unforgeable without a shared secret, because the proxy and the handlers
 * do not share a process. So the smaller safe change is this: the helper
 * does not read the tenant headers at all. It resolves the tenant from the
 * Host header through the same resolver the proxy uses
 * (lib/tenant-resolve.ts resolveRequestTenant). The marketplace, previews
 * and the demo host resolve with no lookup, and a database lookup is cached
 * per instance, so the cost is nothing on the hosts where readers sign in.
 * A request that did not pass through the proxy therefore gets the tenant
 * its Host belongs to, whatever headers it carries, and an unknown host
 * gets none.
 *
 * An unknown slug is refused rather than silently treated as the
 * marketplace: a sealed answer's AAD carries the tenant id, so getting it
 * wrong would lock a reader out of their own answers.
 */
export { MARKETPLACE_TENANT_ID };

// The demo tenant's id is fixed by migration 0023 (F-074).
const KNOWN: Record<string, string> = { akana: MARKETPLACE_TENANT_ID, [DEMO_TENANT_SLUG]: DEMO_TENANT_ID };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function tenantIdForSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return KNOWN[slug] ?? null;
}

/**
 * Id first, slug map second. The name is historical: since L4 the values
 * come from the resolver, not from request headers. The marketplace slug must always carry the
 * marketplace id: a mismatch means something upstream is wrong, so refuse.
 */
export function tenantIdFromHeaders(slug: string | null | undefined, id: string | null | undefined): string | null {
  if (id && UUID.test(id)) {
    const lower = id.toLowerCase();
    if (slug === "akana" && lower !== MARKETPLACE_TENANT_ID) return null;
    if (slug === DEMO_TENANT_SLUG && lower !== DEMO_TENANT_ID) return null;
    return lower;
  }
  return tenantIdForSlug(slug);
}

/** The tenant this request's Host belongs to, or null for an unknown host. Never reads the x-akana-* headers. */
export async function tenantForHost(
  h: { get(name: string): string | null },
  resolve: (host: string) => Promise<HostTenant | null> = resolveRequestTenant,
): Promise<HostTenant | null> {
  return resolve(h.get("host") ?? "");
}

/** The tenant uuid for a set of request headers. The id and slug come from the resolver, not from the request. */
export async function tenantIdForHeaders(
  h: { get(name: string): string | null },
  resolve: (host: string) => Promise<HostTenant | null> = resolveRequestTenant,
): Promise<string | null> {
  const tenant = await tenantForHost(h, resolve);
  return tenant ? tenantIdFromHeaders(tenant.slug, tenant.id) : null;
}

export async function tenantForRequest(): Promise<HostTenant | null> {
  return tenantForHost(await headers());
}

export async function tenantIdForRequest(): Promise<string | null> {
  return tenantIdForHeaders(await headers());
}
