import type { Metadata } from "next";
import Link from "next/link";
import { WorkbookCard } from "@/components/catalogue/WorkbookCard";
import { NeedSupportFooter } from "@/components/NeedSupportFooter";
import { bookClubEligible, bookClubPath, DISCUSSION_PROMPTS, GROUND_RULES, RUN_STEPS } from "@/lib/book-club";
import { brand } from "@/lib/brand";
import { listLibrary } from "@/lib/catalogue";
import { getT } from "@/lib/i18n";
import { publicRobots } from "@/lib/indexing";
import { breadcrumbLd, collectionPageLd, ldString } from "@/lib/public-seo";
import { siteOrigin } from "@/lib/site-url";

/**
 * The Book Club Hub (14.16): programmes a group can work through together,
 * and a plain way to run one. Server rendered for anyone. The list is the
 * live, non-demo programmes with a published first unit, and never a
 * wellbeing title. Each links to its own "Run this with your book club" page.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Book clubs",
  description: `Workbooks a book club can work through together, with a plan for each meeting. Built from books, on ${brand.name}.`,
  alternates: { canonical: "/book-clubs" },
  robots: publicRobots(),
};

export default async function BookClubHubPage() {
  const { t } = await getT();
  const cards = await listLibrary({})
    .then((all) => all.filter(bookClubEligible))
    .catch((err: unknown) => {
      console.error("book_clubs_read_failed", err instanceof Error ? err.message : "");
      return [];
    });
  const origin = siteOrigin();
  const ld = [
    breadcrumbLd(origin, [{ name: brand.name, path: "/" }, { name: "Book clubs", path: "/book-clubs" }]),
    collectionPageLd({ origin, path: "/book-clubs", name: "Book clubs", items: cards.map((c) => ({ name: c.title, path: bookClubPath(c.slug) })) }),
  ];

  return (
    <main className="wb-page browse-page">
      <header className="wb-hero">
        <div className="wrap">
          <nav className="wb-crumbs" aria-label="Breadcrumb">
            <Link href="/">{brand.name}</Link>
          </nav>
          <h1>Book clubs</h1>
          <p className="wb-line">Read the book, then work through it together. Each meeting has a few questions, and nobody has to share what they wrote.</p>
        </div>
      </header>

      <div className="wrap wb-body">
        <section className="wb-section" aria-labelledby="bc-how">
          <h2 id="bc-how">How a group runs one</h2>
          <ol className="wb-outline">
            {RUN_STEPS.map((s) => (
              <li key={s}>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="wb-section" aria-labelledby="bc-rules">
          <h2 id="bc-rules">Ground rules</h2>
          <ul className="wb-for">
            {GROUND_RULES.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>

        <section className="wb-section" aria-labelledby="bc-questions">
          <h2 id="bc-questions">Questions for any meeting</h2>
          <ul className="wb-for">
            {DISCUSSION_PROMPTS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="bc-list">
          <h2 id="bc-list" className="browse-heading">
            Programmes for a group
          </h2>
          {cards.length ? (
            <div className="grid wb-grid">
              {cards.map((card) => (
                <div key={card.id}>
                  <WorkbookCard card={card} outlineOnlyLabel={t("library.outlineOnly")} openLabel={t("library.open")} />
                  <p className="small">
                    <Link href={bookClubPath(card.slug)}>Run this with your book club</Link>
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <section className="empty-state browse-empty">
              <p>No programmes are ready for groups yet. They appear here as soon as they are published.</p>
              <Link className="btn secondary" href="/explore">
                See every programme
              </Link>
            </section>
          )}
        </section>

        <p className="browse-more">
          Running a group for a church or a team? <Link href="/organisations">See Akana for organisations</Link>.
        </p>

        <footer className="footer wb-footer">
          <p>{brand.wellnessNotice}</p>
        </footer>
        <NeedSupportFooter label={t("help.needSupport")} />
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldString(ld) }} />
    </main>
  );
}
