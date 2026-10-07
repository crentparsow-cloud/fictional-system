import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { listPublishers } from "@/lib/author-theme-pages";
import { listThemes } from "@/lib/author-theme-queries";
import { listLibrary } from "@/lib/catalogue";
import { HELP_TOPICS } from "@/lib/help";
import { LEGAL_SLUGS } from "@/lib/legal-docs";
import { listPublicDomainRecords } from "@/lib/public-domain";
import { buildSitemap, siteOriginForRequest } from "@/lib/sitemap";

/**
 * /sitemap.xml (F-011). Built per request for this host's tenant, because
 * the live catalogue comes through RLS. If the catalogue cannot be read the
 * static pages are still listed rather than failing the file.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const h = await headers();
  const origin = siteOriginForRequest(h.get("x-akana-tenant-kind"), h.get("host"));
  const [cards, themes] = await Promise.all([
    listLibrary({}).catch((err: unknown) => {
      console.error("sitemap: library read failed", err instanceof Error ? err.message : err);
      return [];
    }),
    listThemes().catch((err: unknown) => {
      console.error("sitemap: themes read failed", err instanceof Error ? err.message : err);
      return [];
    }),
  ]);
  return buildSitemap({
    origin,
    cards,
    themes,
    publishers: listPublishers(),
    publicDomainCodes: listPublicDomainRecords().map((r) => r.code),
    helpTopics: HELP_TOPICS,
    legalDocs: LEGAL_SLUGS,
  });
}
