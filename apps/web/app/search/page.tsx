import type { Metadata } from "next";
import { NeedSupportFooter } from "@/components/NeedSupportFooter";
import { CatalogueSearch } from "@/components/search/CatalogueSearch";
import type { LibraryCard } from "@/lib/catalogue";
import { loadCollections, loadExploreBase } from "@/lib/explore-queries";
import { getT } from "@/lib/i18n";
import { applyShelfMinimum, parseShelfMinCount } from "@/lib/library-grouping";
import { searchLabels } from "@/lib/search";
import { searchEntriesFor } from "@/lib/search-data";

/**
 * Public search (F-008). The page ships the catalogue index for this host's
 * tenant and the search runs in the browser, so the query never reaches the
 * server: this route reads no search parameter at all. A crisis query shows
 * the Help now card first. If the catalogue cannot be read, the page still
 * renders and Help now still works.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("search.title") };
}

interface SearchSources {
  cards: LibraryCard[];
  themes: { id: string; name: string; line: string | null }[];
  collections: { slug: string; name: string; line: string }[];
}

/** Titles, Themes and collections the reader can see, for the grouped results. */
async function searchSources(): Promise<SearchSources> {
  try {
    const base = await loadExploreBase();
    const cards = applyShelfMinimum(base.cards, parseShelfMinCount(process.env.SHELF_MIN_COUNT));
    const collections = await loadCollections(cards).catch(() => []);
    return { cards, themes: base.themes, collections };
  } catch (err) {
    console.error("search: library read failed", err instanceof Error ? err.message : err);
    return { cards: [], themes: [], collections: [] };
  }
}

export default async function SearchPage() {
  const [{ t }, sources] = await Promise.all([getT(), searchSources()]);
  const entries = await searchEntriesFor(sources.cards, { themes: sources.themes, collections: sources.collections });
  return (
    <main id="main" className="wb-page search-page">
      <header className="wb-hero a-head">
        <div className="wrap">
          <h1>{t("search.title")}</h1>
          <p>{t("search.line")}</p>
        </div>
      </header>
      <div className="wrap wb-body">
        <CatalogueSearch entries={entries} labels={searchLabels(t)} />
        <NeedSupportFooter label={t("help.needSupport")} />
      </div>
    </main>
  );
}
