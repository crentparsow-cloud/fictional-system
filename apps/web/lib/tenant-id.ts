import "server-only";
import { headers } from "next/headers";
import { MARKETPLACE_TENANT_ID } from "@/lib/tenant";

/**
 * The tenant uuid for the current request.
 *
 * The proxy resolves the host and passes x-akana-tenant (slug) and, when it
 * knows it, x-akana-tenant-id (uuid). The proxy deletes any id the client
 * sent, so the header can be trusted on matched routes. When there is no id
 * header the slug map below is used, which today knows only the marketplace
 * (fixed id from migration 0001).
 *
 * An unknown slug is refused rather than silently treated as the
 * marketplace: a sealed answer's AAD carries the tenant id, so getting it
 * wrong would lock a reader out of their own answers.
 */
export { MARKETPLACE_TENANT_ID };

const KNOWN: Record<string, string> = { akana: MARKETPLACE_TENANT_ID };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function tenantIdForSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return KNOWN[slug] ?? null;
}

/**
 * Header first, slug map second. The marketplace slug must always carry the
 * marketplace id: a mismatch means something upstream is wrong, so refuse.
 */
export function tenantIdFromHeaders(slug: string | null | undefined, id: string | null | undefined): string | null {
  if (id && UUID.test(id)) {
    const lower = id.toLowerCase();
    if (slug === "akana" && lower !== MARKETPLACE_TENANT_ID) return null;
    return lower;
  }
  return tenantIdForSlug(slug);
}

export async function tenantIdForRequest(): Promise<string | null> {
  const h = await headers();
  return tenantIdFromHeaders(h.get("x-akana-tenant"), h.get("x-akana-tenant-id"));
}
