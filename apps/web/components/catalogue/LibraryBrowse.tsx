import Link from "next/link";
import type { ReactNode } from "react";
import { WorkbookCard } from "@/components/catalogue/WorkbookCard";
import { getT, type MessageKey } from "@/lib/i18n";
import type { EnrolmentStatus, LengthBucket, LibraryCard, ShelfWithThemes } from "@/lib/catalogue-types";
import {
  applyShelfMinimum,
  filterLibrary,
  filterOptions,
  groupLibrary,
  hasActiveFilters,
  libraryHref,
  parseShelfMinCount,
  type LibraryChange,
  type LibraryQuery,
} from "@/lib/library-grouping";

/**
 * The full catalogue by shelf, then Theme, with the filter chips (F-003).
 * It used to be the Library tab. Since 14.1 it lives on Explore, so the app
 * has four tabs. Chips are links that carry their state in the URL, so it is
 * server rendered with no client state, and filters combine. The caller
 * passes the cards it has already read (Theme gate applied) so Explore reads
 * the catalogue once.
 */
const LENGTH_LABELS: Record<LengthBucket, MessageKey> = {
  short: "library.lengthShort",
  medium: "library.lengthMedium",
  long: "library.lengthLong",
};

export async function LibraryBrowse({
  cards: all,
  shelves,
  enrolments,
  signedIn,
  query,
  base,
}: {
  cards: readonly LibraryCard[];
  shelves: readonly ShelfWithThemes[];
  enrolments: ReadonlyMap<string, EnrolmentStatus> | null;
  signedIn: boolean;
  query: LibraryQuery;
  base: string;
}) {
  const { t, locale } = await getT();
  const BASE = base;
  // Crent sets the figure: SHELF_MIN_COUNT in the environment. Default 3.
  // A shelf below it stays hidden unless the genre filter names it directly.
  const shelfMin = parseShelfMinCount(process.env.SHELF_MIN_COUNT);
  const pool = applyShelfMinimum(all, shelfMin, query.genre);

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
    <section className="library-page" id="all" aria-labelledby="all-heading">
      <h2 id="all-heading">{t("explore.all")}</h2>
      <p className="muted">{t("library.line")}</p>

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

        {signedIn ? (
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
