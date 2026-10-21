import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { listPublishers } from "@/lib/author-theme-pages";
import { listThemes } from "@/lib/author-theme-queries";
import { listLibrary } from "@/lib/catalogue";
import { shelfTiles } from "@/lib/explore";
import { loadCollections, loadExploreBase } from "@/lib/explore-queries";
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
  // 2.11: shelves and collections a visitor can open. A failed read leaves them out, not the whole file.
  let shelfIds: string[] = [];
  let collectionSlugs: string[] = [];
  try {
    const base = await loadExploreBase();
    shelfIds = shelfTiles(base.shelves, base.cards, base.shelfOfTheme).map((s) => s.id);
    collectionSlugs = (await loadCollections(base.cards)).map((c) => c.slug);
  } catch (err) {
    console.error("sitemap: shelves read failed", err instanceof Error ? err.message : err);
  }
  return buildSitemap({
    shelfIds,
    collectionSlugs,
    origin,
    cards,
    themes,
    publishers: listPublishers(),
    publicDomainCodes: listPublicDomainRecords().map((r) => r.code),
    helpTopics: HELP_TOPICS,
    legalDocs: LEGAL_SLUGS,
  });
}
