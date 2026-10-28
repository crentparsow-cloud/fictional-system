import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HelpNowButton } from "@/components/HelpNowButton";
import { NeedSupportFooter } from "@/components/NeedSupportFooter";
import { getReaderSession } from "@/lib/auth";
import { brand } from "@/lib/brand";
import { listThemes } from "@/lib/author-theme-queries";
import { Cover } from "@/components/Cover";
import { WorkbookCard } from "@/components/catalogue/WorkbookCard";
import { getWorkbookBySlug, listLibrary } from "@/lib/catalogue";
import { relatedTitles } from "@/lib/explore";
import { hiddenThemeIds, maskHiddenThemes } from "@/lib/theme-visibility";
import { BADGE_LABELS, jsonLdString, unitWord, workbookMeta } from "@/lib/catalogue-guard";
import { firstUnitFreeLabel } from "@/lib/free-label";
import { getT } from "@/lib/i18n";
import { publicRobots } from "@/lib/indexing";
import { bookClubEligible, bookClubPath } from "@/lib/book-club";
import { publisherForCode } from "@/lib/author-theme-pages";
import { hasPublicDomainRecord } from "@/lib/public-domain";
import { countView } from "@/lib/funnel-server";
import { SampleExercise } from "@/components/catalogue/SampleExercise";
import { whoIsItFor } from "@/lib/who-for";
import { loadSampleExercise } from "@/lib/sample-exercise";
import { tenantIdForRequest } from "@/lib/tenant-id";
import { workbookProof } from "@/lib/social-proof-server";
import { PublicBuy, type PaidLines } from "@/components/catalogue/PublicBuy";
import { normalisePromoCode, offerSummary, PROMO_MESSAGES } from "@/lib/promo-code";
import { lookupPromoCode } from "@/lib/promo-code-server";
import { marketForReader, paidLinesFor, publicOffer } from "@/lib/public-offer";

/**
 * The public workbook page (F-005) at /w/{slug}. Server rendered for anyone,
 * outside the reader group so no sign-in gate sits in front of it. Reads
 * through the user client, so a visitor sees only public workbooks and only
 * their listing and start sections.
 *
 * Buy and Join open the same Stripe Checkout the reader's paywall uses
 * (item 3.2), after sign-in for a visitor; Start opens the free first unit,
 * which enrols the reader on first open (/read). A promotion code in ?code=
 * from the /code page is checked with Stripe and carried into checkout, with
 * the price paid said in plain words (item 5.9). Demo titles are not sold.
 * The book link is a placeholder until /go/ exists. Hidden Theme topics are
 * never read, so they cannot appear here; lib/catalogue-guard.ts tests that.
 */
export const dynamic = "force-dynamic";

type Params = { slug: string };
type Search = { code?: string | string[] };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getWorkbookBySlug(slug);
  if (!detail) return { title: "Workbook" };
  const meta = workbookMeta(detail);
  return {
    title: meta.title,
    description: meta.description,
    // 1.9: one Satori renderer (app/og/[slug]/route.tsx), cached like a cover.
    openGraph: { title: meta.title, description: meta.description, images: [{ url: `/og/${slug}`, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", images: [`/og/${slug}`] },
    // 6.10: one canonical address, and an index request only for a live title with a published first unit.
    // Demo content is never indexed. While SEARCH_INDEXING is not "on" every page stays out (lib/indexing.ts).
    alternates: { canonical: `/w/${slug}` },
    robots: publicRobots({ isDemo: detail.card.isDemo || !detail.card.hasVersion }),
  };
}

export default async function WorkbookPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const [detail, session, { t }] = await Promise.all([getWorkbookBySlug(slug), getReaderSession(), getT()]);
  if (!detail) notFound();
  await countView("page_view", detail.card.id, session?.userId ?? null); // F-141, ids only, opt-out respected

  const { card, listing, start } = detail;
  const wellbeing = card.safetyTier !== "none";
  const canOpen = card.hasVersion;
  const readHref = `/read/${card.slug}`;
  // 5.2: a visitor with no account tries the first unit at /try, where answers stay on the device
  // until they sign in. A wellbeing title asks for consent first, which needs an account.
  const openHref = session ? readHref : card.safetyTier === "none" ? `/try/${card.slug}` : `/sign-in?next=${encodeURIComponent(readHref)}`;
  // 5.12: a real count, only above the threshold, never for a wellbeing title or a demo.
  const proof = !wellbeing && !card.isDemo ? await workbookProof((await tenantIdForRequest()) ?? "", card.id).catch(() => null) : null;
  const unit = unitWord(detail);
  const freeLabel = firstUnitFreeLabel({ hasVersion: card.hasVersion, unit: listing?.structure?.unit ?? null, freeUnits: listing?.structure?.free_units ?? null });

  // Item 3.2: the same figures the paywall and checkout use, for this reader's market.
  const market = await marketForReader(session?.userId ?? null);
  const offer = await publicOffer({ pricePointId: detail.pricePointId, isDemo: card.isDemo, inMembership: detail.inMembership }, market);

  // Item 5.9: a code from the /code page. Checked with Stripe; the page says what is paid, never what "was".
  const code = normalisePromoCode(Array.isArray(sp.code) ? sp.code[0] : sp.code);
  let promoNote: string | null = null;
  let paidLines: PaidLines | null = null;
  if (code && !card.isDemo) {
    const promo = await lookupPromoCode(code, session ? `user:${session.userId}` : "anon");
    if (promo.ok) {
      paidLines = paidLinesFor(offer, promo.offer);
      promoNote = offerSummary(promo.offer, market);
    } else {
      promoNote = PROMO_MESSAGES[promo.reason];
    }
  }
  const returnTo = `/w/${card.slug}${code ? `?code=${encodeURIComponent(code)}` : ""}#buy`;
  const structure = listing?.structure;
  const outline = listing?.outline ?? [];
  const language = listing?.language ?? detail.bookLanguage;
  const minutes = structure?.minutes_per_day;
  const publisher = publisherForCode(card.code);
  const sample = canOpen ? await loadSampleExercise(card.slug, card.safetyTier) : null;
  const forLines = whoIsItFor({ tagline: listing?.tagline, cardLine: card.cardLine, howItWorks: start?.start?.how_it_works, genre: card.genreName, theme: card.themeName, minutes });

  // Item 2.6: up to six titles on the same Theme, by the same author or of the same length.
  // The pool is listLibrary, so the first-unit rule applies. A read that fails leaves the section out.
  let related: Awaited<ReturnType<typeof listLibrary>> = [];
  try {
    const [pool, themeRows] = await Promise.all([listLibrary({}), listThemes()]);
    related = maskHiddenThemes(relatedTitles(card, pool), hiddenThemeIds(themeRows, pool));
  } catch (err) {
    console.error("related_titles_failed", err instanceof Error ? err.message : "");
  }

  const freeUnits = hasFreeUnits(structure?.free_units);
  const authorLine = card.authorRefs?.length ? (
    card.authorRefs.map((a, i) => (
      <span key={a.slug}>
        {i > 0 ? ", " : null}
        <Link href={`/authors/${a.slug}`}>{a.name}</Link>
      </span>
    ))
  ) : card.authors.length ? (
    card.authors.join(", ")
  ) : (
    brand.name
  );
  const themeChip =
    card.themeName && card.themeId ? (
      <Link className="b-chip" href={`/themes/${card.themeId}`}>
        {card.themeName}
      </Link>
    ) : card.themeName ? (
      <span className="b-chip">{card.themeName}</span>
    ) : null;
  const readyElsewhere = canOpen ? [] : related.filter((c) => c.hasVersion && !c.isDemo).slice(0, 3);

  const footerBlock = (
    <>
      <footer className="b-notes">
        <p>{brand.wellnessNotice}</p>
        {listing?.advice_guardrail && listing.advice_guardrail !== "none" ? <p>{guardrailText(listing.advice_guardrail)}</p> : null}
      </footer>
      {!wellbeing ? <NeedSupportFooter label={t("help.needSupport")} /> : null}
    </>
  );

  // Coming soon: a title with no published unit yet. Outline only, nothing to start or buy.
  if (!canOpen) {
    return (
      <main className="b-wb b-soon">
        <header className="b-hero">
          <div className="wrap b-hero-grid">
            <div className="b-cover-wrap b-cover-soon">
              <Cover code={card.code} title={card.title} author={card.authors[0] ?? null} width={300} priority />
              <span className="b-soon-tag">Coming soon</span>
            </div>
            <div className="b-hero-text">
              <nav className="b-crumbs" aria-label="Breadcrumb">
                <Link href="/">{brand.name}</Link> <span aria-hidden="true">/</span> <Link href="/explore">{t("nav.explore")}</Link>
              </nav>
              <p className="b-eyebrow">Coming soon. {authorLine}</p>
              <h1>{card.title}</h1>
              <p className="b-lead">We are still building this one. {card.cardLine}</p>
              <div className="b-chips">
                {themeChip}
                <span className="b-chip">{card.genreName}</span>
              </div>
              <p className="b-small">We have not set an opening date yet. Until then, you can try the workbooks that are ready.</p>
              <div className="b-actions">
                <Link className="btn" href="/explore">
                  See what is ready now
                </Link>
                {wellbeing ? <HelpNowButton label={t("help.now")} /> : null}
              </div>
            </div>
          </div>
        </header>

        <div className="wrap b-body">
          {card.isDemo ? <p className="b-note">{t("badge.demoNote")}</p> : null}

          {outline.length ? (
            <section className="b-section" aria-labelledby="wb-do">
              <h2 id="wb-do">What is planned</h2>
              <ol className="b-weeks">
                {outline.map((u) => (
                  <li key={u.number} className="b-week">
                    <h3>
                      {unit} {u.number}
                    </h3>
                    <p>{u.focus}</p>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {card.isDemo ? (
            <section className="b-section" id="buy" aria-label="About this sample">
              <PublicBuy
                slug={card.slug}
                state={offer.state}
                signedIn={Boolean(session)}
                returnTo={returnTo}
                start={null}
                outlineOnlyLabel={t("library.sampleNotWritten")}
                code={null}
                paidLines={null}
              />
            </section>
          ) : null}

          {readyElsewhere.length ? (
            <section className="b-section" aria-labelledby="b-wait">
              <h2 id="b-wait">While you wait</h2>
              <p className="b-small">These are ready now, and {unit.toLowerCase()} 1 is free.</p>
              <div className="b-related">
                {readyElsewhere.map((c) => (
                  <WorkbookCard key={c.id} card={c} outlineOnlyLabel="Coming soon" openLabel={t("library.open")} />
                ))}
              </div>
            </section>
          ) : null}

          {footerBlock}
        </div>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(detail) }} />
      </main>
    );
  }

  return (
    <main className="b-wb">
      <header className="b-hero">
        <div className="wrap b-hero-grid">
          <div className="b-cover-wrap">
            <Cover code={card.code} title={card.title} author={card.authors[0] ?? null} width={340} priority />
          </div>
          <div className="b-hero-text">
            <nav className="b-crumbs" aria-label="Breadcrumb">
              <Link href="/">{brand.name}</Link> <span aria-hidden="true">/</span> <Link href="/explore">{t("nav.explore")}</Link>
            </nav>
            <p className="b-eyebrow">Workbook. {authorLine}</p>
            <h1>{card.title}</h1>
            <p className="b-lead">{card.cardLine}</p>
            <div className="b-chips">
              {freeLabel ? <span className="b-chip b-chip-hi">{freeLabel}</span> : null}
              {structure?.count ? (
                <span className="b-chip">
                  {structure.count} {structure.count === 1 ? unit.toLowerCase() : `${unit.toLowerCase()}s`}
                </span>
              ) : null}
              {minutes ? <span className="b-chip">About {minutes} minutes a day</span> : null}
              {themeChip}
              <span className="b-chip">{card.genreName}</span>
              <span className={`b-chip${card.badge === "demo" ? " b-chip-demo" : ""}`}>{BADGE_LABELS[card.badge]}</span>
            </div>
            <div className="b-actions">
              <Link className="btn" href={openHref}>
                Try {unit.toLowerCase()} 1 free
              </Link>
              <a className="btn secondary" href="#buy">
                See ways to read
              </a>
              {wellbeing ? <HelpNowButton label={t("help.now")} /> : null}
            </div>
            <p className="b-small">No card needed for {unit.toLowerCase()} 1. Your answers stay private to you.</p>
            <p className="b-small b-code">
              {card.code}
              {card.badge === "public_domain" && hasPublicDomainRecord(card.code) ? (
                <>
                  {" "}
                  <Link href={`/public-domain/${card.code}`}>Public domain: how we checked</Link>
                </>
              ) : null}
            </p>
          </div>
        </div>
      </header>

      <div className="wrap b-body">
        {card.isDemo ? <p className="b-note">{t("badge.demoNote")}</p> : null}
        {proof ? <p className="b-small">{proof}</p> : null}

        <section className="b-section b-two" aria-label="Who it is for and what you take away">
          <div>
            <h2 id="wb-for">Who this is for</h2>
            <ul className="b-for" aria-labelledby="wb-for">
              {forLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2>What you take away</h2>
            <p className="b-soft">You will finish with a certificate in your name, private unless you share it.</p>
            <dl className="b-facts">
              {language ? (
                <div>
                  <dt>Language</dt>
                  <dd>{languageName(language)}</dd>
                </div>
              ) : null}
              {publisher ? (
                <div>
                  <dt>Imprint</dt>
                  <dd>
                    <Link href={`/publishers/${publisher.slug}`}>{publisher.name}</Link>
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        </section>

        <section className="b-band" aria-labelledby="b-how">
          <div className="b-band-in">
            <p className="b-eyebrow">How it works</p>
            <h2 id="b-how">Read a {unit.toLowerCase()}. Try it. Keep what works.</h2>
            <ol className="b-steps">
              <li>
                <span className="b-num" aria-hidden="true">1</span>
                <h3>Read</h3>
                <p>A short idea from the book to start the {unit.toLowerCase()}.</p>
              </li>
              <li>
                <span className="b-num" aria-hidden="true">2</span>
                <h3>Try</h3>
                <p>An exercise to try. Where there is a shorter version, it is there for busy days.</p>
              </li>
              <li>
                <span className="b-num" aria-hidden="true">3</span>
                <h3>Keep</h3>
                <p>Your answers stay private to you. Keep what works.</p>
              </li>
            </ol>
          </div>
        </section>

        {sample ? (
          <section className="b-section b-try" aria-labelledby="wb-try">
            <p className="b-eyebrow">A taste of {unit.toLowerCase()} 1</p>
            <h2 id="wb-try">Try it before you decide</h2>
            <p className="b-soft">This is the first exercise. Take a minute with it, or skip it. No account needed.</p>
            <div className="b-sample">
              <SampleExercise slug={card.slug} exercise={sample.exercise} toolkitTitles={sample.toolkitTitles} />
            </div>
          </section>
        ) : null}

        {outline.length ? (
          <section className="b-section" aria-labelledby="wb-do">
            <p className="b-eyebrow">The path</p>
            <h2 id="wb-do">What you will do</h2>
            <ol className="b-weeks">
              {outline.map((u) => {
                const free = u.number <= freeUnits;
                return (
                  <li key={u.number} className={`b-week${free ? " b-week-free" : ""}`}>
                    <span className="b-tag">{free ? "Free to read" : "Opens with the workbook"}</span>
                    <h3>
                      {unit} {u.number}
                    </h3>
                    <p>{u.focus}</p>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}

        <section className="b-section b-ways" id="buy" aria-label="Get this workbook">
          <p className="b-eyebrow">Ways to read</p>
          <h2>Try week 1 free, then choose</h2>
          {promoNote ? (
            <p className="b-small wb-promo" role="status">
              {promoNote}
            </p>
          ) : null}
          <div className="b-card b-buy">
            <PublicBuy
              slug={card.slug}
              state={offer.state}
              signedIn={Boolean(session)}
              returnTo={returnTo}
              start={{ href: openHref, label: `Try ${unit.toLowerCase()} 1 free` }}
              outlineOnlyLabel={null}
              code={paidLines ? code : null}
              paidLines={paidLines}
            />
          </div>
        </section>

        <section className="b-section b-two b-about" aria-labelledby="wb-author">
          <div>
            <h2 id="wb-author">The author</h2>
            <p>{authorLine}</p>
            {detail.bookTitle ? <p className="b-soft">Based on {detail.bookTitle}.</p> : null}
          </div>
          {detail.bookTitle ? (
            <div>
              <h2>The book</h2>
              <p>
                This workbook is built from <cite>{detail.bookTitle}</cite>
                {card.authors.length ? ` by ${card.authors.join(", ")}` : ""}. Reading the book alongside it is the idea, not a requirement.
              </p>
              <span className="btn secondary is-disabled" aria-disabled="true">
                Buy the book (coming soon)
              </span>
            </div>
          ) : null}
        </section>

        {bookClubEligible(card) ? (
          <section className="b-section" aria-labelledby="wb-club">
            <h2 id="wb-club">With a group</h2>
            <p>
              Working through this with friends? <Link href={bookClubPath(card.slug)}>Run this with your book club</Link>.
            </p>
          </section>
        ) : null}

        {related.length ? (
          <section className="b-section related-titles" aria-labelledby="related-heading">
            <h2 id="related-heading">{t("related.heading")}</h2>
            <p className="b-soft">{t("related.line")}</p>
            <div className="b-related">
              {related.map((c) => (
                <WorkbookCard key={c.id} card={c} outlineOnlyLabel="Coming soon" openLabel={t("library.open")} />
              ))}
            </div>
          </section>
        ) : null}

        {footerBlock}
      </div>

      <div className="b-startbar">
        <Cover code={card.code} title={card.title} author={card.authors[0] ?? null} width={80} />
        <p>{card.title}</p>
        <Link className="btn" href={openHref}>
          Start {unit.toLowerCase()} 1
        </Link>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(detail) }} />
    </main>
  );
}

/** How many leading units are free. Defaults to 1, as everywhere else (policy 7.9). */
function hasFreeUnits(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 1;
}

function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en-GB"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function guardrailText(id: string): string {
  switch (id) {
    case "not_financial_advice":
      return "This workbook is general guidance, not financial advice.";
    case "not_legal_or_tax_advice":
      return "This workbook is general guidance, not legal or tax advice.";
    case "not_medical_advice":
      return "This workbook is general guidance, not medical advice.";
    default:
      return "";
  }
}
