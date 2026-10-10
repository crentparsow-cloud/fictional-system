import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HelpNowButton } from "@/components/HelpNowButton";
import { NeedSupportFooter } from "@/components/NeedSupportFooter";
import { getReaderSession } from "@/lib/auth";
import { brand } from "@/lib/brand";
import { getWorkbookBySlug } from "@/lib/catalogue";
import { BADGE_LABELS, jsonLdString, unitWord, workbookMeta } from "@/lib/catalogue-guard";
import { getT } from "@/lib/i18n";
import { publisherForCode } from "@/lib/author-theme-pages";
import { hasPublicDomainRecord } from "@/lib/public-domain";
import { countView } from "@/lib/funnel-server";
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
    // Demo content is never indexed. Live titles follow the site rule in the root layout.
    ...(detail.card.isDemo ? { robots: { index: false, follow: false } } : {}),
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
  const openHref = session ? readHref : `/sign-in?next=${encodeURIComponent(readHref)}`;
  const unit = unitWord(detail);

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

  return (
    <main className="wb-page">
      <header className="wb-hero">
        <div className="wrap">
          <nav className="wb-crumbs" aria-label="Breadcrumb">
            <Link href="/">{brand.name}</Link> <span aria-hidden="true">/</span> <Link href="/library">{t("nav.library")}</Link>
          </nav>
          <div className="wb-card-top">
            <span className={`badge${card.badge === "demo" ? " demo" : ""}`}>{BADGE_LABELS[card.badge]}</span>
            {card.themeName && card.themeId ? (
              <Link className="chip" href={`/themes/${card.themeId}`}>
                {card.themeName}
              </Link>
            ) : card.themeName ? (
              <span className="chip">{card.themeName}</span>
            ) : null}
            <span className="chip">{card.genreName}</span>
          </div>
          <h1>{card.title}</h1>
          {card.authorRefs?.length ? (
            <p className="wb-author">
              {card.authorRefs.map((a, i) => (
                <span key={a.slug}>
                  {i > 0 ? ", " : null}
                  <Link className="author-link" href={`/authors/${a.slug}`}>
                    {a.name}
                  </Link>
                </span>
              ))}
            </p>
          ) : card.authors.length ? (
            <p className="wb-author">{card.authors.join(", ")}</p>
          ) : null}
          <p className="wb-line">{card.cardLine}</p>
          <p className="muted small">{card.code}</p>
          {card.badge === "public_domain" && hasPublicDomainRecord(card.code) ? (
            <p className="small pd-link">
              <Link href={`/public-domain/${card.code}`}>Public domain: how we checked</Link>
            </p>
          ) : null}
          {promoNote ? (
            <p className="small wb-promo" role="status">
              {promoNote}
            </p>
          ) : null}
          <PublicBuy
            slug={card.slug}
            state={offer.state}
            signedIn={Boolean(session)}
            returnTo={returnTo}
            start={canOpen ? { href: openHref, label: `Start ${unit.toLowerCase()} 1 free` } : null}
            outlineOnlyLabel={t("library.outlineOnly")}
            code={paidLines ? code : null}
            paidLines={paidLines}
          />
          {wellbeing ? (
            <div className="wb-actions">
              <HelpNowButton label={t("help.now")} />
            </div>
          ) : null}
        </div>
      </header>

      <div className="wrap wb-body">
        {card.isDemo ? <p className="demo-note">{t("badge.demoNote")}</p> : null}

        <section className="wb-facts" aria-label="About this workbook">
          <dl>
            {structure?.count ? (
              <div>
                <dt>Length</dt>
                <dd>
                  {structure.count} {structure.count === 1 ? unit.toLowerCase() : `${unit.toLowerCase()}s`}
                </dd>
              </div>
            ) : null}
            {minutes ? (
              <div>
                <dt>Time</dt>
                <dd>About {minutes} minutes a day</dd>
              </div>
            ) : null}
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
            {detail.bookTitle ? (
              <div>
                <dt>Based on</dt>
                <dd>{detail.bookTitle}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        {listing?.tagline || start?.start?.welcome ? (
          <section className="wb-section">
            <h2>Who it is for</h2>
            {listing?.tagline ? <p className="wb-tagline">{listing.tagline}</p> : null}
            {start?.start?.welcome ? <p>{start.start.welcome}</p> : null}
            {start?.start?.how_it_works?.length ? (
              <ul>
                {start.start.how_it_works.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {outline.length ? (
          <section className="wb-section">
            <h2>{unit} by {unit.toLowerCase()}</h2>
            <ol className="wb-outline">
              {outline.map((u) => (
                <li key={u.number}>
                  <span className="wb-outline-n">
                    {unit} {u.number}
                  </span>
                  <span>{u.focus}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : (
          <section className="wb-section">
            <h2>Outline</h2>
            <p className="muted">The {unit.toLowerCase()} by {unit.toLowerCase()} outline is being written. The card line above says what the workbook covers.</p>
          </section>
        )}

        {detail.bookTitle ? (
          <section className="wb-section">
            <h2>The book</h2>
            <p>
              This workbook is built from <cite>{detail.bookTitle}</cite>
              {card.authors.length ? ` by ${card.authors.join(", ")}` : ""}. Reading the book alongside it is the idea, not a requirement.
            </p>
            <span className="btn secondary is-disabled" aria-disabled="true">
              Buy the book (coming soon)
            </span>
          </section>
        ) : null}

        <footer className="footer wb-footer">
          <p>{brand.wellnessNotice}</p>
          {listing?.advice_guardrail && listing.advice_guardrail !== "none" ? <p>{guardrailText(listing.advice_guardrail)}</p> : null}
        </footer>
        {!wellbeing ? <NeedSupportFooter label={t("help.needSupport")} /> : null}
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(detail) }} />
    </main>
  );
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
