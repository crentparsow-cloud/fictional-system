import type { Metadata } from "next";
import Link from "next/link";
import { NeedSupportFooter } from "@/components/NeedSupportFooter";
import { authorIndex, cardsByCodes, listPublishers, workbookCount } from "@/lib/author-theme-pages";
import { brand } from "@/lib/brand";
import { listLibrary } from "@/lib/catalogue";
import { getT } from "@/lib/i18n";

/**
 * Every author and publisher with a live workbook on this storefront (F-006).
 * Built from the live cards, so nobody is listed with nothing to show.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Authors and publishers",
  description: `The authors and publishers behind ${brand.name} workbooks.`,
  alternates: { canonical: "/authors" },
};

export default async function AuthorsPage() {
  const [cards, { t }] = await Promise.all([listLibrary({}), getT()]);
  const authors = authorIndex(cards);
  const publishers = listPublishers()
    .map((p) => ({ ...p, count: cardsByCodes(cards, new Set(p.codes)).length }))
    .filter((p) => p.count > 0);

  return (
    <main className="wb-page browse-page">
      <header className="wb-hero">
        <div className="wrap">
          <nav className="wb-crumbs" aria-label="Breadcrumb">
            <Link href="/">{brand.name}</Link>
          </nav>
          <h1>Authors and publishers</h1>
          <p className="wb-line">The people and imprints behind each workbook. Pick one to see everything they have here.</p>
        </div>
      </header>

      <div className="wrap wb-body">
        <section className="browse-group" aria-labelledby="authors-heading">
          <h2 id="authors-heading" className="browse-heading">
            Authors
          </h2>
          {authors.length ? (
            <ul className="browse-list">
              {authors.map((a) => (
                <li key={a.slug}>
                  <Link className="browse-item" href={`/authors/${a.slug}`}>
                    <span className="browse-item-name">{a.name}</span>
                    <span className="browse-item-count">
                      {workbookCount(a.count)}
                      {a.isDemo ? <span className="badge demo">Demo</span> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Authors appear here once they have a live workbook.</p>
          )}
        </section>

        {publishers.length ? (
          <section className="browse-group" id="publishers" aria-labelledby="publishers-heading">
            <h2 id="publishers-heading" className="browse-heading">
              Publishers
            </h2>
            <ul className="browse-list">
              {publishers.map((p) => (
                <li key={p.slug}>
                  <Link className="browse-item" href={`/publishers/${p.slug}`}>
                    <span className="browse-item-name">{p.name}</span>
                    {p.city ? <span className="browse-item-line">{p.city}</span> : null}
                    <span className="browse-item-count">
                      {workbookCount(p.count)}
                      {p.isDemo ? <span className="badge demo">Demo</span> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="browse-more">
          <Link href="/themes">Browse by Theme</Link>
        </p>

        <footer className="footer wb-footer">
          <p>{brand.wellnessNotice}</p>
        </footer>
        <NeedSupportFooter label={t("help.needSupport")} />
      </div>
    </main>
  );
}
