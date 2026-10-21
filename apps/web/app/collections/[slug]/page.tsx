import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LibraryBookCard } from "@/components/site/BookCard";
import { CollectionCover } from "@/components/explore/CollectionCover";
import { NeedSupportFooter } from "@/components/NeedSupportFooter";
import { brand } from "@/lib/brand";
import { loadCollection, loadExploreBase } from "@/lib/explore-queries";
import { getT } from "@/lib/i18n";
import { publicRobots } from "@/lib/indexing";
import { windowLabel } from "@/lib/seasonal";

/**
 * A collection (build list 2.3): a hand-curated group of titles across
 * shelves, in staff order, with a cover from the cover pattern system and one
 * line. Titles that are not live or whose first unit is incomplete are left
 * out; a collection with fewer than three left is a 404.
 */
export const dynamic = "force-dynamic";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const base = await loadExploreBase();
  const c = await loadCollection(slug, base.cards);
  return c
    ? { title: c.name, description: c.line || undefined, alternates: { canonical: `/collections/${slug}` }, robots: publicRobots() }
    : { title: "Collection" };
}

export default async function CollectionPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const [{ t }, base] = await Promise.all([getT(), loadExploreBase()]);
  const collection = await loadCollection(slug, base.cards);
  if (!collection) notFound();

  return (
    <main className="wb-page browse-page collection-page">
      <header className="wb-hero a-head">
        <div className="wrap collection-hero">
          <div>
            <nav className="wb-crumbs" aria-label="Breadcrumb">
              <Link href="/">{brand.name}</Link> <span aria-hidden="true">/</span> <Link href="/explore">{t("explore.title")}</Link>
            </nav>
            <p className="browse-eyebrow">{t("collection.eyebrow")}</p>
            <h1>{collection.name}</h1>
            {collection.line ? <p className="wb-line">{collection.line}</p> : null}
            <p className="small">{collection.cards.length === 1 ? t("collection.countOne") : t("collection.count", { count: collection.cards.length })}</p>
            {windowLabel(collection.startsOn, collection.endsOn) ? <p className="small muted collection-window">{windowLabel(collection.startsOn, collection.endsOn)}</p> : null}
          </div>
          <CollectionCover slug={collection.slug} genreId={collection.coverGenre} pattern={collection.coverPattern} alt={t("collection.coverAlt", { name: collection.name })} />
        </div>
      </header>

      <div className="wrap wb-body">
        <ol className="collection-list a-books">
          {collection.cards.map((card) => (
            <li key={card.id}>
              <LibraryBookCard card={card} />
            </li>
          ))}
        </ol>
        <p className="browse-more">
          <Link href="/explore">{t("collection.back")}</Link>
        </p>
        <NeedSupportFooter label={t("help.needSupport")} />
      </div>
    </main>
  );
}
