import "server-only";
import { headers } from "next/headers";
import { createUserClient } from "@/lib/supabase/server";
import { validateBrand, type TenantBrand } from "@/lib/tenant-brand";

/**
 * Reads for the tenant site (app/site, F-067 to F-069, F-074). Everything
 * goes through the user client with the publishable key, so a tenant host
 * sees only what anon may see: public.tenant_site and public.tenant_catalogue
 * (migration 0023) and the public workbook sections.
 *
 * The tenant comes from the proxy's headers. A page refuses (null) unless
 * the request is on a white-label host with a known tenant id and the tenant
 * is active.
 */

export interface TenantSite {
  id: string;
  slug: string;
  name: string;
  brand: TenantBrand;
  isDemo: boolean;
  poweredBy: boolean;
}

export interface TenantCard {
  workbookId: string;
  code: string;
  slug: string;
  title: string;
  cardLine: string;
  badge: "official" | "made_with_author" | "public_domain" | "demo";
  isDemo: boolean;
  safetyTier: "none" | "standard" | "higher";
  genreName: string | null;
  authors: string[];
  hasVersion: boolean;
  featured: boolean;
  pricePointId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The white-label tenant id for this request, or null on the marketplace or with no id. */
export async function whiteLabelTenantId(): Promise<string | null> {
  const h = await headers();
  if (h.get("x-akana-tenant-kind") !== "white_label") return null;
  const id = (h.get("x-akana-tenant-id") ?? "").toLowerCase();
  return UUID.test(id) ? id : null;
}

/**
 * The tenant for a page: the site, "not_found" (no white-label tenant here,
 * or it is not active) or "unavailable" (the lookup failed). Pages render
 * TenantUnavailable for the last, so the locked standards are still in the
 * server HTML during an outage.
 */
export async function loadTenantSite(): Promise<TenantSite | "not_found" | "unavailable"> {
  try {
    return (await getTenantSite()) ?? "not_found";
  } catch (err) {
    console.error("tenant_site_unavailable", err instanceof Error ? err.message : "unknown");
    return "unavailable";
  }
}

export async function getTenantSite(): Promise<TenantSite | null> {
  const id = await whiteLabelTenantId();
  if (!id) return null;
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("tenant_site", { p_tenant: id });
  if (error) throw new Error(`tenant_site: ${error.code ?? error.message}`);
  const row = (Array.isArray(data) ? data[0] : null) as
    | { tenant_id: string; slug: string; kind: string; name: string; brand: unknown; is_demo: boolean; status: string; powered_by: boolean }
    | null
    | undefined;
  if (!row || row.kind !== "white_label" || row.status !== "active") return null;
  // The database has already refused a bad brand; an unexpected one still falls back to the house look.
  const checked = validateBrand(row.brand);
  return {
    id: row.tenant_id,
    slug: row.slug,
    name: row.name,
    brand: checked.ok ? checked.brand : {},
    isDemo: row.is_demo,
    poweredBy: row.powered_by,
  };
}

interface CatalogueRow {
  workbook_id: string;
  code: string;
  slug: string;
  title: string;
  card_line: string;
  badge: TenantCard["badge"];
  is_demo: boolean;
  safety_tier: TenantCard["safetyTier"];
  genre_name: string | null;
  authors: string[] | null;
  has_version: boolean;
  featured: boolean;
  price_point_id: string | null;
}

export async function listTenantCatalogue(tenantId: string): Promise<TenantCard[]> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("tenant_catalogue", { p_tenant: tenantId });
  if (error) throw new Error(`tenant_catalogue: ${error.code ?? error.message}`);
  return ((data ?? []) as CatalogueRow[]).map((r) => ({
    workbookId: r.workbook_id,
    code: r.code,
    slug: r.slug,
    title: r.title,
    cardLine: r.card_line,
    badge: r.badge,
    isDemo: r.is_demo,
    safetyTier: r.safety_tier,
    genreName: r.genre_name,
    authors: r.authors ?? [],
    hasVersion: r.has_version,
    featured: r.featured,
    pricePointId: r.price_point_id,
  }));
}

/** One listed workbook on this tenant, or null when the tenant does not show it. */
export async function tenantListing(tenantId: string, slug: string): Promise<TenantCard | null> {
  const cards = await listTenantCatalogue(tenantId);
  return cards.find((c) => c.slug === slug) ?? null;
}
