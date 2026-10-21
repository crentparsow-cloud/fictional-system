import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/Cover";
import { BookGrid, bookTag } from "@/components/site/BookCard";
import { lengthBadge } from "@/lib/explore";
import { FollowAuthor } from "@/components/catalogue/FollowAuthor";
import { HelpNowButton } from "@/components/HelpNowButton";
import { NeedSupportFooter } from "@/components/NeedSupportFooter";
import { cardsByAuthor, countryName, safeWebsite, workbookCount } from "@/lib/author-theme-pages";
import { getAuthorBySlug } from "@/lib/author-theme-queries";
import { getReaderSession } from "@/lib/auth";
import { brand } from "@/lib/brand";
import { listLibrary } from "@/lib/catalogue";
import { getT } from "@/lib/i18n";
import { createUserClient } from "@/lib/supabase/server";
import { isFollowingAuthor } from "@/lib/rails-queries";
import { publicRobots } from "@/lib/indexing";
import { breadcrumbLd, ldString, personLd } from "@/lib/public-seo";
import { siteOrigin } from "@/lib/site-url";

/**
 * An author page (F-006) at /authors/{slug}: display name (never a legal
 * name), short bio, country, a link to their own site and their live
 * workbooks on this storefront. Demo authors carry the demo label on the page
 * and are kept out of search indexes. An author with nothing live here is a
 * 404, so one storefront never lists another's authors.
 */
export const dynamic = "force-dynamic";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const author = await getAuthorBySlug(slug);
  if (!author) return { title: "Author" };
  const lead = author.isDemo ? "Demo author. " : "";
  return {
    title: author.isDemo ? `${author.name} (demo)` : author.name,
    description: `${lead}Guided workbooks by ${author.name} on ${brand.name}.`,
    alternates: { canonical: `/authors/${author.slug}` },
    robots: publicRobots({ isDemo: author.isDemo }),
  };
}

export default async function AuthorPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const author = await getAuthorBySlug(slug);
  if (!author) notFound();
  const [all, { t }, session] = await Promise.all([listLibrary({}), getT(), getReaderSession()]);
  const cards = cardsByAuthor(all, author.slug);
  if (!cards.length) notFound();

  // 14.12: the authors this author recommends, and the ones who recommend them. Public authors only (migration 0052).
  const recommends: { name: string; slug: string }[] = [];
  const recommendedBy: { name: string; slug: string }[] = [];
  try {
    const supabase = await createUserClient();
    const { data: recs } = await supabase.rpc("author_recommendations_for", { p_slug: author.slug });
    for (const r of (recs ?? []) as { direction: string; display_name: string; slug: string }[]) {
      (r.direction === "recommends" ? recommends : recommendedBy).push({ name: r.display_name, slug: r.slug });
    }
  } catch {
    // the recommendations are an extra: the page reads fine without them
  }

  const more = all.filter((c) => !c.isDemo && !cards.some((x) => x.id === c.id)).slice(0, 3);
  const following = session ? await isFollowingAuthor(session.userId, author.slug) : false;
  const wellbeing = cards.some((c) => c.safetyTier !== "none");
  const country = countryName(author.country);
  const website = safeWebsite(author.website);
  const origin = siteOrigin();
  const ld = [
    breadcrumbLd(origin, [{ name: brand.name, path: "/" }, { name: "Authors", path: "/authors" }, { name: author.name, path: `/authors/${author.slug}` }]),
    personLd({ origin, path: `/authors/${author.slug}`, name: author.name, bio: author.bio, website }),
  ];

  return (
    <main className="wb-page browse-page">
      <header className="wb-hero a-head a-author-head">
        <div className="wrap a-author-grid">
          <span className="a-initials" aria-hidden="true">
            {author.name
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0]?.toUpperCase())
              .join("")}
          </span>
          <div>
          <nav className="wb-crumbs" aria-label="Breadcrumb">
            <Link href="/">{brand.name}</Link> <span aria-hidden="true">/</span> <Link href="/authors">Authors</Link>
          </nav>
          <div className="wb-card-top">
            {author.isDemo ? <span className="badge demo">Demo author</span> : null}
            {author.isPublicDomain ? <span className="badge">Public domain classic</span> : null}
          </div>
          <h1>{author.name}</h1>
          {country ? <p className="muted small">{country}</p> : null}
          <p className="muted small">{workbookCount(cards.length)}</p>
          {author.isDemo ? null : <FollowAuthor slug={author.slug} following={following} signedIn={Boolean(session)} failed={sp.follow === "failed"} />}
          {website || wellbeing ? (
            <div className="wb-actions">
              {website ? (
                <a className="btn secondary" href={website} rel="noopener nofollow" target="_blank">
                  Visit their website
                </a>
              ) : null}
              {wellbeing ? <HelpNowButton label={t("help.now")} /> : null}
            </div>
          ) : null}
          </div>
        </div>
      </header>

      <div className="wrap wb-body">
        {author.isDemo ? <p className="demo-note">Demo author. This person is invented for testing. Nothing here is for sale.</p> : null}

        {author.bio ? (
          <section className="wb-section" aria-labelledby="author-about">
            <h2 id="author-about" className="browse-heading">
              About
            </h2>
            <p>{author.bio}</p>
          </section>
        ) : null}

        <section aria-labelledby="author-workbooks">
          <h2 id="author-workbooks" className="browse-heading">
            Workbooks
          </h2>
          <ul className="a-works" role="list">
            {cards.map((card) => {
              const tag = bookTag(card);
              return (
                <li key={card.id} className="a-work">
                  <Link href={`/w/${card.slug}`} className="a-work-cover" tabIndex={-1} aria-hidden="true">
                    <Cover code={card.code} title={card.title} author={author.name} width={300} />
                  </Link>
                  <div className="a-work-text">
                    {tag ? <span className="a-book-tag">{tag}</span> : null}
                    <h3>
                      <Link href={`/w/${card.slug}`}>{card.title}</Link>
                    </h3>
                    {card.cardLine ? <p>{card.cardLine}</p> : null}
                    {lengthBadge(card) ? <p className="a-book-meta">{lengthBadge(card)}</p> : null}
                    <p className="a-actions">
                      <Link className="btn" href={`/w/${card.slug}`}>
                        {card.hasVersion && !card.isDemo ? "Try week 1 free" : "See the workbook"}
                      </Link>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {recommends.length > 0 ? (
          <section className="wb-section" aria-labelledby="author-recommends">
            <h2 id="author-recommends" className="browse-heading">
              Authors {author.name} recommends
            </h2>
            <ul>
              {recommends.map((a) => (
                <li key={a.slug}>
                  <Link href={`/authors/${a.slug}`}>{a.name}</Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {recommendedBy.length > 0 ? (
          <section className="wb-section" aria-labelledby="author-recommended-by">
            <h2 id="author-recommended-by" className="browse-heading">
              Recommended by
            </h2>
            <ul>
              {recommendedBy.map((a) => (
                <li key={a.slug}>
                  <Link href={`/authors/${a.slug}`}>{a.name}</Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {more.length ? (
          <section aria-labelledby="author-more">
            <div className="a-section-head">
              <h2 id="author-more" className="browse-heading">
                More from the library
              </h2>
              <Link className="a-more" href="/explore">
                See the whole library
              </Link>
            </div>
            <BookGrid cards={more} />
          </section>
        ) : null}

        <p className="browse-more">
          <Link href="/authors">More authors</Link>
        </p>

        {!wellbeing ? <NeedSupportFooter label={t("help.needSupport")} /> : null}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldString(ld) }} />
    </main>
  );
}
