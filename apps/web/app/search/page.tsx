import type { Metadata } from "next";
import { NeedSupportFooter } from "@/components/NeedSupportFooter";
import { CatalogueSearch } from "@/components/search/CatalogueSearch";
import { listLibrary, type LibraryCard } from "@/lib/catalogue";
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

async function searchCards(): Promise<LibraryCard[]> {
  try {
    const all = await listLibrary({});
    return applyShelfMinimum(all, parseShelfMinCount(process.env.SHELF_MIN_COUNT));
  } catch (err) {
    console.error("search: library read failed", err instanceof Error ? err.message : err);
    return [];
  }
}

export default async function SearchPage() {
  const [{ t }, cards] = await Promise.all([getT(), searchCards()]);
  const entries = await searchEntriesFor(cards);
  return (
    <main id="main" className="wb-page search-page">
      <header className="wb-hero">
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
