import type { Metadata } from "next";
import Link from "next/link";
import { BookGrid } from "@/components/site/BookCard";
import { CollectionCover } from "@/components/explore/CollectionCover";
import { Rail } from "@/components/explore/Rail";
import { EditorialSlot } from "@/components/explore/EditorialSlot";
import { ShelfTile } from "@/components/explore/ShelfTile";
import { LibraryBrowse } from "@/components/catalogue/LibraryBrowse";
import { NeedSupportFooter } from "@/components/NeedSupportFooter";
import { ReaderTabs } from "@/components/ReaderTabs";
import { CatalogueSearch } from "@/components/search/CatalogueSearch";
import { searchLabels } from "@/lib/search";
import { searchEntriesFor } from "@/lib/search-data";
import { listShelvesWithThemes, myEnrolmentStatuses } from "@/lib/catalogue";
import { applyShelfMinimum, hasActiveFilters, parseLibraryQuery, parseShelfMinCount } from "@/lib/library-grouping";
import { getReaderSession } from "@/lib/auth";
import { themeIndex, workbookCount } from "@/lib/author-theme-pages";
import { brand } from "@/lib/brand";
import {
  becauseYouRead,
  filterByLength,
  lengthOptions,
  mostStarted,
  newThisWeek,
  parseProgrammeLength,
  rankByEngagement,
  shelfTiles,
  shortProgrammes,
  type ProgrammeLength,
} from "@/lib/explore";
import { loadCollections, loadExploreBase, loadReadSeeds } from "@/lib/explore-queries";
import { personalRails, railHeadingMessage } from "@/lib/rails";
import { loadFollowedAuthorSlugs, loadRailSignals } from "@/lib/rails-queries";
import { loadEditorialSlot } from "@/lib/editorial-queries";
import { getT } from "@/lib/i18n";
import { publicRobots } from "@/lib/indexing";
import { windowLabel } from "@/lib/seasonal";
import { hasMessage, type MessageKey } from "@/lib/locale";

/**
 * Explore (build list 2.1), in the order readers expect: shelf tiles first,
 * then rails (New this week, Short programmes, Most started, Because you
 * read X, Collections), then Themes as a second-level grid. Rails rank by
 * finish rate where the counts are large enough, otherwise by starts
 * (lib/explore.ts). The programme length filter (2.4) is a link row that
 * carries its state in the URL, so the page is server rendered.
 *
 * Since 14.1 this is also the catalogue: the old Library tab folded in. The
 * search box sits under the heading. The shelf, Theme, author, language and
 * length chips and the full grouped list show when a chip is chosen or the
 * reader asks for every workbook (?all=1). /library redirects here. The page
 * is public. A signed-in reader gets the four tabs.
 *
 * Every card comes from listLibrary, so the first-unit rule holds, and the
 * Theme gate (F-148) is applied once in loadExploreBase. Demo titles keep
 * their label; the workbook page decides what can be bought.
 */
export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

export const metadata: Metadata = {
  title: "Explore",
  description: `Explore ${brand.name} workbooks by shelf, by programme length and by what readers finish.`,
  alternates: { canonical: "/explore" },
  robots: publicRobots(),
};

const LENGTH_KEYS: Record<ProgrammeLength, MessageKey> = {
  "4": "explore.length4",
  "8": "explore.length8",
  "12": "explore.length12",
};

export default async function ExplorePage({ searchParams }: { searchParams: Promise<Search> }) {
  const [{ t }, sp, session] = await Promise.all([getT(), searchParams, getReaderSession()]);
  const length = parseProgrammeLength(sp.length);
  const libraryQuery = parseLibraryQuery(sp);
  const browse = hasActiveFilters(libraryQuery) || sp.all === "1";
  const base = await loadExploreBase();
  const collectionsPromise = loadCollections(base.cards);
  const [collections, seeds, shelvesWithThemes, enrolments, searchEntries, editorial] = await Promise.all([
    collectionsPromise,
    session ? loadReadSeeds(session.userId) : Promise.resolve([]),
    browse ? listShelvesWithThemes() : Promise.resolve([]),
    browse && session ? myEnrolmentStatuses(session.userId) : Promise.resolve(null),
    // F-008: the on-device search index covers every visible title, whatever the filters.
    collectionsPromise.then((cols) => searchEntriesFor(applyShelfMinimum(base.cards, parseShelfMinCount(process.env.SHELF_MIN_COUNT)), { themes: base.themes, collections: cols })),
    // 7.10: the weekly editorial slot, only on the plain Explore view.
    browse || length ? Promise.resolve(null) : loadEditorialSlot(base.cards, base.themes),
  ]);

  const { cards, signals } = base;
  // 2.9 and 2.10: rails from what this reader did and the authors they follow.
  // Only on the plain Explore view, and only for a signed-in reader.
  const personal =
    session && !browse && !length
      ? personalRails({
          cards,
          signals: await loadRailSignals(),
          seeds,
          followedAuthors: await loadFollowedAuthorSlugs(session.userId),
          shelfOfTheme: base.shelfOfTheme,
          shelves: base.shelves,
        })
      : [];
  const tiles = shelfTiles(base.shelves, cards, base.shelfOfTheme);
  const options = lengthOptions(cards);
  const filtered = length ? rankByEngagement(filterByLength(cards, length), signals) : [];
  const because = becauseYouRead(cards, seeds, base.shelfOfTheme, signals);
  const themeShelves = themeIndex(base.themeRows, cards);

  const outlineOnly = t("library.outlineOnly");
  const open = t("library.open");
  const countLabel = (n: number) => (n === 0 ? t("explore.titlesNone") : n === 1 ? t("explore.titlesOne") : t("explore.titles", { count: n }));
  const lineFor = (id: string) => (hasMessage(`shelf.line.${id}`) ? t(`shelf.line.${id}` as MessageKey) : null);

  return (
    <>
    <main className={session ? "wb-page browse-page explore-page has-tabs" : "wb-page browse-page explore-page"}>
      <header className="wb-hero a-head">
        <div className="wrap">
          <nav className="wb-crumbs" aria-label="Breadcrumb">
            <Link href="/">{brand.name}</Link>
          </nav>
          <h1>{t("explore.title")}</h1>
          <p className="wb-line">{t("explore.line")}</p>
        </div>
      </header>

      <div className="wrap wb-body">
        <CatalogueSearch entries={searchEntries} labels={searchLabels(t)} />

        {browse ? (
          <LibraryBrowse cards={base.cards} shelves={shelvesWithThemes} enrolments={enrolments} signedIn={Boolean(session)} query={libraryQuery} base="/explore" />
        ) : null}

        <EditorialSlot slot={editorial} outlineOnlyLabel={t("library.outlineOnly")} openLabel={t("library.open")} />

        {browse ? null : (
        <section aria-labelledby="explore-shelves">
          <h2 id="explore-shelves" className="browse-heading">
            {t("explore.shelves")}
          </h2>
          <ul className="shelf-tiles a-tiles">
            {tiles.map((s) => (
              <li key={s.id}>
                <ShelfTile id={s.id} name={s.name} line={lineFor(s.id)} countLabel={countLabel(s.count)} />
              </li>
            ))}
          </ul>
        </section>
        )}

        {browse ? null : options.length > 1 || length ? (
          <nav className="chips explore-length" aria-label={t("explore.filterLength")}>
            <span className="library-chip-label small" aria-hidden="true">
              {t("explore.filterLength")}
            </span>
            <Link className="chip" href="/explore" aria-current={length ? undefined : "true"}>
              {t("explore.anyLength")}
            </Link>
            {options.map((l) => (
              <Link key={l} className="chip" href={`/explore?length=${l}`} aria-current={length === l ? "true" : undefined}>
                {t(LENGTH_KEYS[l])}
              </Link>
            ))}
          </nav>
        ) : null}

        {browse ? null : cards.length === 0 ? (
          <section className="empty-state browse-empty">
            <p>{t("explore.empty")}</p>
          </section>
        ) : length ? (
          <section aria-labelledby="explore-filtered">
            <h2 id="explore-filtered" className="browse-heading">
              {t("explore.filteredHeading", { length: t(LENGTH_KEYS[length]) })}
            </h2>
            {filtered.length ? (
              <BookGrid cards={filtered} />
            ) : (
              <div className="card empty-state">
                <p>{t("explore.emptyFiltered")}</p>
                <Link className="btn secondary" href="/explore">
                  {t("explore.clear")}
                </Link>
              </div>
            )}
          </section>
        ) : (
          <>
            {personal.map((r) => {
              const m = railHeadingMessage(r.heading);
              return <Rail key={r.id} id={`for-you-${r.id}`} heading={t(m.key, m.values)} cards={r.cards} outlineOnlyLabel={outlineOnly} openLabel={open} />;
            })}
            <Rail id="new" heading={t("explore.railNew")} cards={newThisWeek(cards, new Date())} outlineOnlyLabel={outlineOnly} openLabel={open} />
            <Rail
              id="short"
              heading={t("explore.railShort")}
              line={t("explore.railShortLine")}
              cards={shortProgrammes(cards, signals)}
              outlineOnlyLabel={outlineOnly}
              openLabel={open}
              seeAll={{ href: "/explore?length=4", label: t("explore.seeAll") }}
            />
            <Rail id="most" heading={t("explore.railMost")} cards={mostStarted(cards, signals)} outlineOnlyLabel={outlineOnly} openLabel={open} />
            {because ? (
              <Rail
                id="because"
                heading={t(because.basis === "theme" ? "explore.railBecause" : "explore.railBecauseShelf", { title: because.seed.title })}
                cards={because.cards}
                outlineOnlyLabel={outlineOnly}
                openLabel={open}
              />
            ) : null}

            {collections.length ? (
              <section className="rail" aria-labelledby="rail-collections">
                <div className="rail-head">
                  <h2 id="rail-collections">{t("explore.railCollections")}</h2>
                </div>
                <ul className="rail-row collection-row">
                  {collections.map((c) => (
                    <li key={c.id}>
                      <Link className="collection-tile" href={`/collections/${c.slug}`}>
                        <CollectionCover slug={c.slug} genreId={c.coverGenre} pattern={c.coverPattern} alt={t("collection.coverAlt", { name: c.name })} />
                        <span className="collection-tile-name">{c.name}</span>
                        {c.line ? <span className="collection-tile-line">{c.line}</span> : null}
                        <span className="collection-tile-count">{c.cards.length === 1 ? t("collection.countOne") : t("collection.count", { count: c.cards.length })}</span>
                        {windowLabel(c.startsOn, c.endsOn) ? <span className="collection-tile-count">{windowLabel(c.startsOn, c.endsOn)}</span> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {themeShelves.length ? (
              <section aria-labelledby="explore-themes">
                <h2 id="explore-themes" className="browse-heading">
                  {t("explore.themes")}
                </h2>
                <p className="muted small">{t("explore.themesLine")}</p>
                {themeShelves.map((shelf) => (
                  <div key={shelf.shelfId ?? "none"} className="browse-group">
                    <h3 className="theme-title">{shelf.shelfName ?? "More Themes"}</h3>
                    <ul className="browse-list">
                      {shelf.themes.map((theme) => (
                        <li key={theme.id}>
                          <Link className="browse-item" href={`/themes/${theme.id}`}>
                            <span className="browse-item-name">{theme.name}</span>
                            {theme.line ? <span className="browse-item-line">{theme.line}</span> : null}
                            <span className="browse-item-count">{workbookCount(theme.count)}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ) : null}
          </>
        )}

        <section className="a-asks" aria-label="More from us">
          <div>
            <h2>Missing a book you love?</h2>
            <p>Tell us which one. It helps us choose what to build next.</p>
            <Link className="btn secondary" href="/request-title">
              Suggest a book
            </Link>
          </div>
          <div>
            <h2>Are you an author?</h2>
            <p>Turn your book into a workbook readers finish.</p>
            <Link className="btn secondary" href="/publish">
              Publish with {brand.name}
            </Link>
          </div>
        </section>

        <p className="browse-more explore-links">
          {browse ? <Link href="/explore">{t("explore.title")}</Link> : <Link href="/explore?all=1#all">{t("explore.fullLibrary")}</Link>}
          {session ? (
            <>
              {" "}
              <Link href="/my-workbooks">{t("explore.myWorkbooks")}</Link>
            </>
          ) : null}
        </p>

        <NeedSupportFooter label={t("help.needSupport")} />
      </div>
    </main>
    {session ? <ReaderTabs /> : null}
    </>
  );
}
