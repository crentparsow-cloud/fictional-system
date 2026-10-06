import "server-only";
import { headers } from "next/headers";

/**
 * The tenant uuid for the current request. The proxy resolves the host to a
 * tenant slug and passes it as x-akana-tenant. Migration 0001 seeds the
 * marketplace tenant with a fixed id, so the marketplace needs no lookup.
 *
 * TODO(week 2): look white-label slugs up in public.tenants (or Edge Config)
 * instead of this map. Until then an unknown slug is refused rather than
 * silently treated as the marketplace: a sealed answer's AAD carries the
 * tenant id, so getting it wrong would lock a reader out of their own answers.
 */
export const MARKETPLACE_TENANT_ID = "00000000-0000-0000-0000-00000000000a";

const KNOWN: Record<string, string> = { akana: MARKETPLACE_TENANT_ID };

export function tenantIdForSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return KNOWN[slug] ?? null;
}

export async function tenantIdForRequest(): Promise<string | null> {
  const h = await headers();
  return tenantIdForSlug(h.get("x-akana-tenant"));
}
