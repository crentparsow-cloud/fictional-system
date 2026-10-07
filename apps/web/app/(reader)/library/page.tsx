import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { WorkbookCard } from "@/components/catalogue/WorkbookCard";
import { NeedSupportFooter } from "@/components/NeedSupportFooter";
import { CatalogueSearch } from "@/components/search/CatalogueSearch";
import { searchLabels } from "@/lib/search";
import { searchEntriesFor } from "@/lib/search-data";
import { getReaderSession } from "@/lib/auth";
import type { LengthBucket } from "@/lib/catalogue-types";
import { listLibrary, listShelvesWithThemes, myEnrolmentStatuses } from "@/lib/catalogue";
import { getT, type MessageKey } from "@/lib/i18n";
import {
  applyShelfMinimum,
  filterLibrary,
  filterOptions,
  groupLibrary,
  hasActiveFilters,
  libraryHref,
  parseLibraryQuery,
  parseShelfMinCount,
  type LibraryChange,
} from "@/lib/library-grouping";

/**
 * The Library tab (F-003): live workbooks grouped by genre shelf, then Theme.
 * Filter chips are links that carry their state in the URL, so the page is
 * server rendered with no client state, and filters combine. Demo content is
 * labelled on every card (F-004). The live database may hold nothing yet, so
 * the empty state has to look finished.
 *
 * One catalogue read for the tenant (capped at 200 rows), then the pure
 * helpers in lib/library-grouping.ts apply the shelf minimum and the filters.
 */
export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

const BASE = "/library";

const LENGTH_LABELS: Record<LengthBucket, MessageKey> = {
  short: "library.lengthShort",
  medium: "library.lengthMedium",
  long: "library.lengthLong",
};

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("nav.library") };
}

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { t, locale } = await getT();
  const query = parseLibraryQuery(await searchParams);
  const session = await getReaderSession();
  const [all, shelves, enrolments] = await Promise.all([
    listLibrary({}),
    listShelvesWithThemes(),
    session ? myEnrolmentStatuses(session.userId) : Promise.resolve(null),
  ]);

  // Crent sets the figure: SHELF_MIN_COUNT in the environment. Default 3.
  // A shelf below it stays hidden unless the genre filter names it directly.
  const shelfMin = parseShelfMinCount(process.env.SHELF_MIN_COUNT);
  const pool = applyShelfMinimum(all, shelfMin, query.genre);
  // F-008: the on-device search index covers every visible title, whatever the filters.
  const searchEntries = await searchEntriesFor(applyShelfMinimum(all, shelfMin));

  const cards = filterLibrary(pool, query, enrolments);
  const groups = groupLibrary(cards);
  const filtered = hasActiveFilters(query);

  // Chips come from the visible titles, so an empty or hidden shelf never shows one.
  const genres = [...new Map(pool.map((c) => [c.genreId, c.genreName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const themes = shelves.flatMap((s) => s.themes).filter((th) => pool.some((c) => c.themeId === th.id));
  const options = filterOptions(pool);
  const languageName = languageNamer(locale);

  const href = (change: LibraryChange) => libraryHref(BASE, query, change);
  const chip = (key: string, label: string, change: LibraryChange, current: boolean) => (
    <Link key={key} className="chip" href={href(change)} aria-current={current ? "true" : undefined}>
      {label}
    </Link>
  );

  return (
    <section className="tab-page library-page">
      <h1>{t("nav.library")}</h1>
      <p className="muted">{t("library.line")}</p>

      <CatalogueSearch entries={searchEntries} labels={searchLabels(t)} />

      <div className="library-filters">
        {genres.length > 1 || query.genre ? (
          <ChipRow label={t("library.filterGenre")}>
            {chip("all", t("library.allShelves"), { genre: null, theme: null }, !query.genre)}
            {genres.map(([id, name]) => chip(id, name, { genre: id, theme: null }, query.genre === id))}
          </ChipRow>
        ) : null}

        {themes.length > 1 || query.theme ? (
          <ChipRow label={t("library.filterTheme")}>
            {chip("all", t("library.allThemes"), { theme: null }, !query.theme)}
            {themes.map((th) => chip(th.id, th.name, { theme: th.id }, query.theme === th.id))}
          </ChipRow>
        ) : null}

        {options.authors.length > 1 || query.author ? (
          <ChipRow label={t("library.filterAuthor")}>
            {chip("all", t("library.allAuthors"), { author: null }, !query.author)}
            {options.authors.map((a) => chip(a.slug, a.name, { author: a.slug }, query.author === a.slug))}
          </ChipRow>
        ) : null}

        {options.languages.length > 1 || query.lang ? (
          <ChipRow label={t("library.filterLanguage")}>
            {chip("all", t("library.allLanguages"), { lang: null }, !query.lang)}
            {options.languages.map((l) => chip(l, languageName(l), { lang: l }, query.lang === l))}
          </ChipRow>
        ) : null}

        {options.lengths.length > 1 || query.length ? (
          <ChipRow label={t("library.filterLength")}>
            {chip("all", t("library.anyLength"), { length: null }, !query.length)}
            {options.lengths.map((b) => chip(b, t(LENGTH_LABELS[b]), { length: b }, query.length === b))}
          </ChipRow>
        ) : null}

        {session ? (
          <ChipRow label={t("library.filterYours")}>
            {chip("mine", t("library.mine"), { mine: !query.mine }, Boolean(query.mine))}
            {chip("progress", t("library.inProgress"), { progress: !query.progress }, Boolean(query.progress))}
          </ChipRow>
        ) : null}
      </div>

      <div className="library-count-row">
        <p className="muted small library-count" role="status">
          {cards.length === 1 ? t("library.countOne") : t("library.count", { count: cards.length })}
        </p>
        {filtered ? (
          <Link className="library-clear small" href={BASE}>
            {t("library.clear")}
          </Link>
        ) : null}
      </div>

      {cards.length === 0 ? (
        <div className="card empty-state">
          <p>{filtered ? t("library.emptyFiltered") : t("library.empty")}</p>
          {filtered ? (
            <Link className="btn secondary" href={BASE}>
              {t("library.clear")}
            </Link>
          ) : null}
        </div>
      ) : (
        groups.map((shelf) => (
          <section key={shelf.genreId} className="shelf" aria-labelledby={`shelf-${shelf.genreId}`}>
            <h2 id={`shelf-${shelf.genreId}`}>
              {shelf.genreName} <span className="muted small shelf-count">{shelf.count}</span>
            </h2>
            {shelf.themes.map((theme) => (
              <div key={theme.themeId ?? "none"} className="theme-group">
                {shelf.themes.length > 1 || theme.themeId ? <h3 className="theme-title">{theme.themeName ?? t("library.noTheme")}</h3> : null}
                <div className="grid wb-grid">
                  {theme.cards.map((card) => (
                    <WorkbookCard key={card.id} card={card} outlineOnlyLabel={t("library.outlineOnly")} openLabel={t("library.open")} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))
      )}

      <NeedSupportFooter label={t("help.needSupport")} />
    </section>
  );
}

function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav className="chips library-chip-row" aria-label={label}>
      <span className="library-chip-label small" aria-hidden="true">
        {label}
      </span>
      {children}
    </nav>
  );
}

/** "en" reads as "English" in the reader's locale. Falls back to the tag. */
function languageNamer(locale: string): (tag: string) => string {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale], { type: "language" });
  } catch {
    names = null;
  }
  return (tag) => {
    try {
      return names?.of(tag) ?? tag;
    } catch {
      return tag;
    }
  };
}
