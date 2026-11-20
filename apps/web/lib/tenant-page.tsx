import "server-only";
import { notFound } from "next/navigation";
import { TenantUnavailable } from "@/components/tenant/TenantUnavailable";
import { tenantRequest } from "@/lib/tenant-reader";
import { loadTenantSite, type TenantSite } from "@/lib/tenant-site";

/**
 * The first lines of every reader page on a tenant site (F-133). A page is
 * a 404 unless this is a white-label host with a known tenant and reader
 * sign-in is on for it. The proxy already refuses these routes otherwise;
 * this is the second check, in the page itself.
 *
 * Returns the site, or the element to render when the tenant lookup failed
 * (the locked standards are still in that page).
 */
export async function tenantReaderPage(): Promise<{ site: TenantSite; host: string; unavailable?: undefined } | { unavailable: React.ReactElement; site?: undefined }> {
  const req = await tenantRequest();
  if (!req || !req.signIn) notFound();
  const site = await loadTenantSite();
  if (site === "not_found") notFound();
  if (site === "unavailable") return { unavailable: <TenantUnavailable /> };
  if (site.id !== req.tenantId) notFound();
  return { site, host: req.host };
}
