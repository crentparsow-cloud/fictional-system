import type { Metadata } from "next";
import Link from "next/link";
import { WorkbookCard } from "@/components/catalogue/WorkbookCard";
import { NeedSupportFooter } from "@/components/NeedSupportFooter";
import { listLibrary, listShelvesWithThemes } from "@/lib/catalogue";
import { getT } from "@/lib/i18n";
import { chipHref, groupLibrary } from "@/lib/library-grouping";

/**
 * The Library tab (F-003): live workbooks grouped by genre shelf, then Theme.
 * Filter chips are links that carry their state in the URL, so the page is
 * server rendered with no client state. Demo content is labelled on every
 * card (F-004). The live database may hold nothing yet, so the empty state
 * has to look finished.
 */
export const dynamic = "force-dynamic";

type Search = { genre?: string; theme?: string; q?: string };

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("nav.library") };
}

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { t } = await getT();
  const sp = await searchParams;
  const current = { genre: one(sp.genre), theme: one(sp.theme), q: one(sp.q) };
  const [cards, shelves] = await Promise.all([listLibrary(current), listShelvesWithThemes()]);
  const groups = groupLibrary(cards);
  const filtered = Boolean(current.genre || current.theme || current.q);

  // Genre chips come from the cards on this tenant, so an empty shelf never shows a chip.
  const allCards = filtered ? await listLibrary({}) : cards;
  const genres = [...new Map(allCards.map((c) => [c.genreId, c.genreName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const themes = shelves.flatMap((s) => s.themes).filter((th) => allCards.some((c) => c.themeId === th.id));

  return (
    <section className="tab-page library-page">
      <h1>{t("nav.library")}</h1>
      <p className="muted">{t("library.line")}</p>

      {genres.length > 1 ? (
        <nav className="chips" aria-label={t("library.filterGenre")}>
          <Link className="chip" href={chipHref("/library", current, { genre: null, theme: null })} aria-current={!current.genre ? "true" : undefined}>
            {t("library.allShelves")}
          </Link>
          {genres.map(([id, name]) => (
            <Link key={id} className="chip" href={chipHref("/library", current, { genre: id, theme: null })} aria-current={current.genre === id ? "true" : undefined}>
              {name}
            </Link>
          ))}
        </nav>
      ) : null}

      {themes.length > 1 ? (
        <nav className="chips" aria-label={t("library.filterTheme")}>
          <Link className="chip" href={chipHref("/library", current, { theme: null })} aria-current={!current.theme ? "true" : undefined}>
            {t("library.allThemes")}
          </Link>
          {themes.map((th) => (
            <Link key={th.id} className="chip" href={chipHref("/library", current, { theme: th.id })} aria-current={current.theme === th.id ? "true" : undefined}>
              {th.name}
            </Link>
          ))}
        </nav>
      ) : null}

      <p className="muted small library-count">
        {cards.length === 1 ? t("library.countOne") : t("library.count", { count: cards.length })}
        {filtered ? (
          <>
            {" "}
            <Link href="/library">{t("library.clear")}</Link>
          </>
        ) : null}
      </p>

      {cards.length === 0 ? (
        <div className="card empty-state">
          <p>{filtered ? t("library.emptyFiltered") : t("library.empty")}</p>
          {filtered ? <Link className="btn secondary" href="/library">{t("library.clear")}</Link> : null}
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

function one(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s ? s.slice(0, 80) : undefined;
}
