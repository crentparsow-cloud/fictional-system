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
import { hasPublicDomainRecord } from "@/lib/public-domain";

/**
 * The public workbook page (F-005) at /w/{slug}. Server rendered for anyone,
 * outside the reader group so no sign-in gate sits in front of it. Reads
 * through the user client, so a visitor sees only public workbooks and only
 * their listing and start sections.
 *
 * Commerce is not wired: buy and membership are disabled placeholders. The
 * book link is a placeholder until /go/ exists. Hidden Theme topics are never
 * read, so they cannot appear here; lib/catalogue-guard.ts tests that.
 */
export const dynamic = "force-dynamic";

type Params = { slug: string };

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

export default async function WorkbookPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const [detail, session, { t }] = await Promise.all([getWorkbookBySlug(slug), getReaderSession(), getT()]);
  if (!detail) notFound();

  const { card, listing, start } = detail;
  const wellbeing = card.safetyTier !== "none";
  const canOpen = card.hasVersion;
  const readHref = `/read/${card.slug}`;
  const openHref = session ? readHref : `/sign-in?next=${encodeURIComponent(readHref)}`;
  const unit = unitWord(detail);
  const structure = listing?.structure;
  const outline = listing?.outline ?? [];
  const language = listing?.language ?? detail.bookLanguage;
  const minutes = structure?.minutes_per_day;

  return (
    <main className="wb-page">
      <header className="wb-hero">
        <div className="wrap">
          <nav className="wb-crumbs" aria-label="Breadcrumb">
            <Link href="/">{brand.name}</Link> <span aria-hidden="true">/</span> <Link href="/library">{t("nav.library")}</Link>
          </nav>
          <div className="wb-card-top">
            <span className={`badge${card.badge === "demo" ? " demo" : ""}`}>{BADGE_LABELS[card.badge]}</span>
            {card.themeName ? <span className="chip">{card.themeName}</span> : null}
            <span className="chip">{card.genreName}</span>
          </div>
          <h1>{card.title}</h1>
          {card.authors.length ? <p className="wb-author">{card.authors.join(", ")}</p> : null}
          <p className="wb-line">{card.cardLine}</p>
          <p className="muted small">{card.code}</p>
          {card.badge === "public_domain" && hasPublicDomainRecord(card.code) ? (
            <p className="small pd-link">
              <Link href={`/public-domain/${card.code}`}>Public domain: how we checked</Link>
            </p>
          ) : null}
          <div className="wb-actions">
            {canOpen ? (
              <Link className="btn" href={openHref}>
                Open {unit.toLowerCase()} 1 free
              </Link>
            ) : (
              <span className="btn secondary is-disabled" aria-disabled="true">
                {t("library.outlineOnly")}
              </span>
            )}
            <button type="button" className="btn secondary" disabled aria-describedby="coming-soon">
              Buy
            </button>
            <button type="button" className="btn secondary" disabled aria-describedby="coming-soon">
              Membership
            </button>
            {wellbeing ? <HelpNowButton label={t("help.now")} /> : null}
          </div>
          <p id="coming-soon" className="muted small">
            Buying and membership are coming soon.
          </p>
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
