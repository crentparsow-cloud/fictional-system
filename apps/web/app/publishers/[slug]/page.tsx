import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkbookCard } from "@/components/catalogue/WorkbookCard";
import { HelpNowButton } from "@/components/HelpNowButton";
import { NeedSupportFooter } from "@/components/NeedSupportFooter";
import { authorIndex, cardsByCodes, countryName, findPublisher, workbookCount } from "@/lib/author-theme-pages";
import { brand } from "@/lib/brand";
import { listLibrary } from "@/lib/catalogue";
import { getT } from "@/lib/i18n";

/**
 * A publisher page (F-006) at /publishers/{slug}: the imprint's name, base,
 * short note, its authors and its live workbooks on this storefront. Today
 * every imprint is a demo imprint from the demo catalogue, labelled on the
 * page and kept out of search indexes. An imprint with nothing live here is a
 * 404.
 */
export const dynamic = "force-dynamic";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const publisher = findPublisher(slug);
  if (!publisher) return { title: "Publisher" };
  const lead = publisher.isDemo ? "Demo imprint. " : "";
  return {
    title: publisher.isDemo ? `${publisher.name} (demo)` : publisher.name,
    description: `${lead}Guided workbooks from ${publisher.name} on ${brand.name}.`,
    alternates: { canonical: `/publishers/${publisher.slug}` },
    ...(publisher.isDemo ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function PublisherPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const publisher = findPublisher(slug);
  if (!publisher) notFound();
  const [all, { t }] = await Promise.all([listLibrary({}), getT()]);
  const cards = cardsByCodes(all, new Set(publisher.codes));
  if (!cards.length) notFound();

  const authors = authorIndex(cards);
  const wellbeing = cards.some((c) => c.safetyTier !== "none");
  const place = [publisher.city, countryName(publisher.country)].filter(Boolean).join(", ");

  return (
    <main className="wb-page browse-page">
      <header className="wb-hero">
        <div className="wrap">
          <nav className="wb-crumbs" aria-label="Breadcrumb">
            <Link href="/">{brand.name}</Link> <span aria-hidden="true">/</span> <Link href="/authors#publishers">Publishers</Link>
          </nav>
          {publisher.isDemo ? (
            <div className="wb-card-top">
              <span className="badge demo">Demo imprint</span>
            </div>
          ) : null}
          <h1>{publisher.name}</h1>
          {place ? <p className="muted small">{place}</p> : null}
          <p className="muted small">{workbookCount(cards.length)}</p>
          {wellbeing ? (
            <div className="wb-actions">
              <HelpNowButton label={t("help.now")} />
            </div>
          ) : null}
        </div>
      </header>

      <div className="wrap wb-body">
        {publisher.isDemo ? <p className="demo-note">Demo imprint. It is invented for testing, as are its authors. Nothing here is for sale.</p> : null}

        {publisher.note ? (
          <section className="wb-section" aria-labelledby="publisher-about">
            <h2 id="publisher-about" className="browse-heading">
              About
            </h2>
            <p>{publisher.note}</p>
          </section>
        ) : null}

        {authors.length ? (
          <section className="wb-section" aria-labelledby="publisher-authors">
            <h2 id="publisher-authors" className="browse-heading">
              Authors
            </h2>
            <ul className="chips browse-chips">
              {authors.map((a) => (
                <li key={a.slug}>
                  <Link className="chip" href={`/authors/${a.slug}`}>
                    {a.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="publisher-workbooks">
          <h2 id="publisher-workbooks" className="browse-heading">
            Workbooks
          </h2>
          <div className="grid wb-grid">
            {cards.map((card) => (
              <WorkbookCard key={card.id} card={card} outlineOnlyLabel={t("library.outlineOnly")} openLabel={t("library.open")} />
            ))}
          </div>
        </section>

        <p className="browse-more">
          <Link href="/authors#publishers">More publishers</Link>
        </p>

        <footer className="footer wb-footer">
          <p>{brand.wellnessNotice}</p>
        </footer>
        {!wellbeing ? <NeedSupportFooter label={t("help.needSupport")} /> : null}
      </div>
    </main>
  );
}
