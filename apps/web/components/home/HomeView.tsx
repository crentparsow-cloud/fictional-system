import Link from "next/link";
import { Cover } from "@/components/Cover";
import { MarketingShot } from "@/components/MarketingShot";
import { shelfStyleVars } from "@/components/explore/ShelfTile";
import { WorkbookCard } from "@/components/catalogue/WorkbookCard";
import type { HomeSections } from "@/components/home/sections";

/**
 * The marketing home (F-002), rendered from buildHomeSections(). Server
 * component, no client JavaScript. The library row falls back to a plain
 * empty state when no workbook is live.
 */
export function HomeView({ s, outlineOnlyLabel, openLabel }: { s: HomeSections; outlineOnlyLabel: string; openLabel: string }) {
  return (
    <main className="home">
      <section className="hero home-hero" aria-labelledby="home-line">
        <div className="wrap mk-hero-grid">
          <div>
            <h1 id="home-line">{s.hero.line}</h1>
            <p className="home-lead">{s.hero.lead}</p>
            <p className="home-ctas">
              <Link className="btn home-btn-light" href={s.hero.primary.href}>
                {s.hero.primary.label}
              </Link>
              <Link className="btn secondary home-btn-ghost" href={s.hero.secondary.href}>
                {s.hero.secondary.label}
              </Link>
            </p>
          </div>
          <div className="mk-hero-shots">
            <MarketingShot name="today-phone" alt="The Today screen: a card to carry on with the next unit, a one tap daily check and a suggestion, above the four tabs." priority />
            <MarketingShot name="explore-phone" alt="The Explore screen: a search box and ten shelves as pastel tiles, each with an icon." priority />
          </div>
        </div>
      </section>

      <section className="wrap home-section" aria-labelledby="home-try">
        <div className="mk-try" style={shelfStyleVars("personal-growth")}>
          <div>
            <h2 id="home-try">{s.tryIt.title}</h2>
            <p>{s.tryIt.body}</p>
          </div>
          <Link className="btn" href={s.tryIt.link.href}>
            {s.tryIt.link.label}
          </Link>
        </div>
      </section>

      <section className="wrap home-section" aria-labelledby="home-trust">
        <h2 id="home-trust">{s.trust.title}</h2>
        <ul className="home-trust" role="list">
          {s.trust.points.map((p) => (
            <li className="card" key={p.title}>
              <h3>{p.title}</h3>
              <p className="muted">{p.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="home-band" aria-labelledby="home-steps">
        <div className="wrap home-section">
          <h2 id="home-steps">{s.steps.title}</h2>
          <ol className="home-steps">
            {s.steps.items.map((step, i) => (
              <li key={step.title}>
                <span className="home-step-n" aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <h3>{step.title}</h3>
                  <p className="muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="wrap home-section" aria-labelledby="home-library">
        <div className="page-head">
          <h2 id="home-library">{s.library.title}</h2>
          {s.library.kind === "cards" ? (
            <Link className="library-clear" href={s.library.more.href}>
              {s.library.more.label}
            </Link>
          ) : null}
        </div>
        {s.library.kind === "cards" ? (
          <ul className="home-shelf" role="list">
            {s.library.cards.map((card) => (
              <li key={card.id} className="home-shelf-item">
                <Link href={`/w/${card.slug}`} className="home-cover-link" tabIndex={-1} aria-hidden="true">
                  <Cover code={card.code} title={card.title} author={card.authors[0] ?? null} width={180} />
                </Link>
                <WorkbookCard card={card} outlineOnlyLabel={outlineOnlyLabel} openLabel={openLabel} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="card empty-state home-empty">
            <p>{s.library.message}</p>
            <Link href={s.library.more.href}>{s.library.more.label}</Link>
          </div>
        )}
      </section>

      <section className="wrap home-section" aria-labelledby="home-inside">
        <h2 id="home-inside">Inside a workbook</h2>
        <div className="mk-shots">
          <div>
            <MarketingShot name="workbook-phone" alt="A workbook page: the cover, a 12 week programme label, what you will do and the path through the weeks." />
            <p className="mk-shot-cap">Know what you are starting</p>
          </div>
          <div>
            <MarketingShot name="unit-phone" alt="A unit in the reader: a calm page of serif text, one exercise with a saved line and one button for the next step." />
            <p className="mk-shot-cap">A calm page to read</p>
          </div>
          <div>
            <MarketingShot name="start-phone" alt="The start quiz: one question at a time, with large answers." />
            <p className="mk-shot-cap">Find a starting point</p>
          </div>
        </div>
      </section>

      <section className="home-band" aria-labelledby="home-publish">
        <div className="wrap home-section home-publish">
          <div>
            <h2 id="home-publish">{s.publishers.title}</h2>
            <p>{s.publishers.body}</p>
          </div>
          <Link className="btn" href={s.publishers.link.href}>
            {s.publishers.link.label}
          </Link>
        </div>
      </section>

      <footer className="footer home-footer">
        <div className="wrap">
          <nav aria-label="Legal and support">
            <ul className="home-footer-links" role="list">
              {[...s.footer.legal, ...s.footer.other].map((l) => (
                <li key={l.href}>
                  <Link href={l.href}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <p>{s.footer.notice}</p>
        </div>
      </footer>
    </main>
  );
}
