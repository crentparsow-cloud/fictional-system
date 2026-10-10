import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkbookCard } from "@/components/catalogue/WorkbookCard";
import { Rail } from "@/components/explore/Rail";
import { ShelfIcon, shelfStyleVars } from "@/components/explore/ShelfTile";
import { NeedSupportFooter } from "@/components/NeedSupportFooter";
import { workbookCount } from "@/lib/author-theme-pages";
import { brand } from "@/lib/brand";
import { cardsOnShelf, featuredTitle, mostStarted, newThisWeek, shelfTiles, shortProgrammes, themesOnShelf } from "@/lib/explore";
import { loadExploreBase } from "@/lib/explore-queries";
import { getT } from "@/lib/i18n";
import { hasMessage, type MessageKey } from "@/lib/locale";

/**
 * A shelf page (build list 2.2) repeats the Explore pattern for one shelf:
 * its Themes, three short lists, a featured title, an editor's line and the
 * count. The featured title is the staff choice while it is still on the
 * shelf, otherwise the one readers finish most. The editor's line is a plain
 * text field staff set in the console (/admin/shelves).
 *
 * A shelf that is retired, unknown or held back below its minimum is a 404.
 */
export const dynamic = "force-dynamic";

type Params = { slug: string };
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LIST_SIZE = 4;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  if (!SLUG.test(slug)) return { title: "Shelf" };
  const base = await loadExploreBase();
  const shelf = base.shelves.find((s) => s.id === slug);
  return shelf ? { title: shelf.name, alternates: { canonical: `/shelves/${slug}` } } : { title: "Shelf" };
}

export default async function ShelfPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  if (!SLUG.test(slug)) notFound();
  const [{ t }, base] = await Promise.all([getT(), loadExploreBase()]);
  const shelf = base.shelves.find((s) => s.id === slug);
  if (!shelf) notFound();
  // A held shelf below its minimum is not listed on Explore, so it has no page either.
  if (!shelfTiles(base.shelves, base.cards, base.shelfOfTheme).some((s) => s.id === slug)) notFound();

  const { signals } = base;
  const cards = cardsOnShelf(base.cards, slug, base.shelfOfTheme);
  const themes = themesOnShelf(base.themes, cards, slug);
  const featured = featuredTitle(cards, shelf.featuredWorkbookId, signals);
  const outlineOnly = t("library.outlineOnly");
  const open = t("library.open");
  const lineKey = `shelf.line.${slug}`;
  const shelfLine = hasMessage(lineKey) ? t(lineKey as MessageKey) : null;
  const list = (id: string, heading: string, items: typeof cards) => (
    <Rail id={id} heading={heading} cards={items.slice(0, LIST_SIZE)} outlineOnlyLabel={outlineOnly} openLabel={open} />
  );

  return (
    <main className="wb-page browse-page shelf-page" style={shelfStyleVars(slug)}>
      <header className="wb-hero shelf-hero">
        <div className="wrap">
          <nav className="wb-crumbs" aria-label="Breadcrumb">
            <Link href="/">{brand.name}</Link> <span aria-hidden="true">/</span> <Link href="/explore">{t("explore.title")}</Link>
          </nav>
          <p className="browse-eyebrow">
            <ShelfIcon shelfId={slug} size={22} /> {t("shelf.eyebrow")}
          </p>
          <h1>{shelf.name}</h1>
          {shelfLine ? <p className="wb-line">{shelfLine}</p> : null}
          <p className="small shelf-count-line">{cards.length === 1 ? t("explore.titlesOne") : t("explore.titles", { count: cards.length })}</p>
        </div>
      </header>

      <div className="wrap wb-body">
        {shelf.editorsLine ? (
          <aside className="editor-line" aria-label={t("shelf.editor")}>
            <p className="small editor-line-label">{t("shelf.editor")}</p>
            <p>{shelf.editorsLine}</p>
          </aside>
        ) : null}

        {cards.length === 0 ? (
          <section className="empty-state browse-empty">
            <p>{t("shelf.empty")}</p>
          </section>
        ) : (
          <>
            {featured ? (
              <section aria-labelledby="shelf-featured">
                <h2 id="shelf-featured" className="browse-heading">
                  {t("shelf.featured")}
                </h2>
                <div className="grid wb-grid shelf-featured">
                  <WorkbookCard card={featured} outlineOnlyLabel={outlineOnly} openLabel={open} />
                </div>
              </section>
            ) : null}

            {themes.length ? (
              <section aria-labelledby="shelf-themes">
                <h2 id="shelf-themes" className="browse-heading">
                  {t("shelf.themes")}
                </h2>
                <ul className="browse-list">
                  {themes.map((theme) => (
                    <li key={theme.id}>
                      <Link className="browse-item" href={`/themes/${theme.id}`}>
                        <span className="browse-item-name">{theme.name}</span>
                        {theme.line ? <span className="browse-item-line">{theme.line}</span> : null}
                        <span className="browse-item-count">{workbookCount(theme.count)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {list("new", t("shelf.listNew"), newThisWeek(cards, new Date()))}
            {list("short", t("shelf.listShort"), shortProgrammes(cards, signals))}
            {list("most", t("shelf.listMost"), mostStarted(cards, signals))}
          </>
        )}

        <p className="browse-more">
          <Link href="/explore">{t("shelf.back")}</Link>
        </p>
        <footer className="footer wb-footer">
          <p>{brand.wellnessNotice}</p>
        </footer>
        <NeedSupportFooter label={t("help.needSupport")} />
      </div>
    </main>
  );
}
