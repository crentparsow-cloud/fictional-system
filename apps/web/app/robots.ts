import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { buildRobots, siteOriginForRequest } from "@/lib/sitemap";

/**
 * /robots.txt (F-011). Crawlers may visit public pages and are asked to
 * keep out of signed-in, staff, API and one-time link routes. Whether a
 * page is indexed is still decided by its robots meta: the root layout is
 * noindex until launch, and demo pages stay noindex after it.
 */
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  return buildRobots(siteOriginForRequest(h.get("x-akana-tenant-kind"), h.get("host")));
}
