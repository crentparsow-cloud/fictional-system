import type { Metadata } from "next";
import Link from "next/link";
import { NeedSupportFooter } from "@/components/NeedSupportFooter";
import { themeIndex, workbookCount } from "@/lib/author-theme-pages";
import { listThemes } from "@/lib/author-theme-queries";
import { brand } from "@/lib/brand";
import { listLibrary } from "@/lib/catalogue";
import { getT } from "@/lib/i18n";

/**
 * Every Theme with at least one live workbook (F-007), grouped by shelf.
 * Themes are the shared shelves across authors, so this is the plainest way
 * in for someone who knows what they want help with but not which book.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Themes",
  description: `Browse ${brand.name} workbooks by Theme. Each Theme gathers guided workbooks on one subject from every author.`,
  alternates: { canonical: "/themes" },
};

export default async function ThemesPage() {
  const [themes, cards, { t }] = await Promise.all([listThemes(), listLibrary({}), getT()]);
  const shelves = themeIndex(themes, cards);

  return (
    <main className="wb-page browse-page">
      <header className="wb-hero">
        <div className="wrap">
          <nav className="wb-crumbs" aria-label="Breadcrumb">
            <Link href="/">{brand.name}</Link>
          </nav>
          <h1>Themes</h1>
          <p className="wb-line">Pick a subject. Each Theme brings together workbooks on it from every author.</p>
        </div>
      </header>

      <div className="wrap wb-body">
        {shelves.length ? (
          shelves.map((shelf) => (
            <section key={shelf.shelfId ?? "none"} className="browse-group" aria-labelledby={`shelf-${shelf.shelfId ?? "none"}`}>
              <h2 id={`shelf-${shelf.shelfId ?? "none"}`} className="browse-heading">
                {shelf.shelfName ?? "More Themes"}
              </h2>
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
            </section>
          ))
        ) : (
          <section className="empty-state browse-empty">
            <h2 className="browse-heading">Nothing here yet</h2>
            <p>Themes appear here once they have a live workbook.</p>
          </section>
        )}

        <p className="browse-more">
          <Link href="/authors">Browse by author</Link>
        </p>

        <footer className="footer wb-footer">
          <p>{brand.wellnessNotice}</p>
        </footer>
        <NeedSupportFooter label={t("help.needSupport")} />
      </div>
    </main>
  );
}
