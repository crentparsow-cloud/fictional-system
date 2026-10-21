import type { ReactNode } from "react";
import Link from "next/link";
import { Cover } from "@/components/Cover";
import { BookGrid } from "@/components/site/BookCard";
import type { HomeSections } from "@/components/home/sections";

/**
 * The marketing home (F-002), rendered from buildHomeSections(). Server
 * component, no client JavaScript. The library row falls back to a plain
 * empty state when no workbook is live. The public header and footer come
 * from the site chrome, so this view holds neither.
 */
export function HomeView({
  s,
  editorial,
}: {
  s: HomeSections;
  /** Kept so the page can still pass them. The cards now carry their own wording. */
  outlineOnlyLabel?: string;
  openLabel?: string;
  /** The weekly editorial slot (7.10), when there is one. */
  editorial?: ReactNode;
}) {
  const covers = s.hero.covers;
  return (
    <main id="main" className="home a-home">
      <section className="a-hero" aria-labelledby="home-line">
        <div className="wrap a-hero-grid">
          <div className="a-hero-text">
            <p className="a-eyebrow">Akana. {s.hero.line}</p>
            <h1 id="home-line">
              Read a week. Try it. <span className="a-accent">Keep what works.</span>
            </h1>
            <p className="a-lead">{s.hero.lead}</p>
            <p className="a-actions">
              <Link className="btn a-btn" href={s.hero.primary.href}>
                {s.hero.primary.label}
              </Link>
              <Link className="btn secondary a-btn-ghost" href={s.hero.secondary.href}>
                {s.hero.secondary.label}
              </Link>
            </p>
            <p className="a-note">{s.hero.note}</p>
          </div>
          {covers.length ? (
            <div className={`a-hero-covers a-hero-covers-${covers.length}`} aria-hidden="true">
              <span className="a-hero-disc" />
              {covers.map((c, i) => (
                <span key={c.id} className={`a-hero-cover a-hero-cover-${i + 1}`}>
                  <Cover code={c.code} title={c.title} author={c.authors[0] ?? null} width={240} priority={i === 0} />
                </span>
              ))}
              <span className="a-hero-pill">Free week 1</span>
            </div>
          ) : null}
        </div>
      </section>

      {s.goals.links.length ? (
        <section className="wrap a-goals" aria-labelledby="home-goals">
          <h2 id="home-goals">{s.goals.title}</h2>
          <ul className="a-chips" role="list">
            {s.goals.links.map((l) => (
              <li key={l.href}>
                <Link className="a-chip" href={l.href}>
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <Link className="a-chip a-chip-dark" href={s.goals.all.href}>
                {s.goals.all.label}
              </Link>
            </li>
          </ul>
        </section>
      ) : null}

      <section id="week" className="wrap a-week" aria-labelledby="home-steps">
        <div className="a-week-text">
          <p className="a-eyebrow">{s.week.eyebrow}</p>
          <h2 id="home-steps">{s.week.title}</h2>
          <p className="a-lead-soft">{s.week.lead}</p>
          <ol className="a-steps">
            {s.steps.items.map((step, i) => (
              <li key={step.title}>
                <span className="a-step-n" aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="a-example" role="group" aria-label="An example exercise">
          <div className="a-example-top">
            <p className="a-eyebrow">Week 1. Exercise</p>
            <span className="a-pill">About 6 minutes</span>
          </div>
          <h3>Look at where last week went</h3>
          <p className="a-read">Write down three things you paid for this week. Next to each one, add a single word: need, want or habit.</p>
          <div className="a-lines" aria-hidden="true">
            <p>Start typing here. Nobody else will see it.</p>
          </div>
          <p className="a-example-foot">
            <span className="a-chip a-chip-static">Short version, 2 minutes</span>
          </p>
        </div>
      </section>

      {editorial ? <div className="wrap a-editorial">{editorial}</div> : null}

      <section className="a-books-band" aria-labelledby="home-library">
        <div className="wrap a-section">
          <div className="a-section-head">
            <div>
              <p className="a-eyebrow">{s.library.kind === "cards" ? s.library.title : "Library"}</p>
              <h2 id="home-library">{s.library.kind === "cards" ? "Start with a classic" : "From the library"}</h2>
            </div>
            {s.library.kind === "cards" ? (
              <Link className="a-more" href={s.library.more.href}>
                {s.library.more.label}
              </Link>
            ) : null}
          </div>
          {s.library.kind === "cards" ? (
            <BookGrid cards={s.library.cards} />
          ) : (
            <div className="a-empty">
              <p>{s.library.message}</p>
              <Link className="a-more" href={s.library.more.href}>
                {s.library.more.label}
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="a-busy" aria-labelledby="home-busy">
        <div className="wrap a-split">
          <div className="a-busy-text">
            <p className="a-eyebrow a-eyebrow-gold">{s.busy.eyebrow}</p>
            <h2 id="home-busy">{s.busy.title}</h2>
            <p>{s.busy.body}</p>
          </div>
          <div className="a-figures">
            {[s.busy.full, s.busy.short].map((f) => (
              <div className="a-figure" key={f.label}>
                <p className="a-figure-n">{f.figure}</p>
                <p className="a-figure-unit">{f.unit}</p>
                <p className="a-figure-label">{f.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="wrap a-split a-plan" aria-labelledby="home-plan">
        <div className="a-plan-card" aria-hidden="true">
          <p className="a-eyebrow">Your small plan</p>
          {[92, 70, 86, 60, 80].map((w, i) => (
            <span key={i} className="a-bar" style={{ inlineSize: `${w}%` }} />
          ))}
        </div>
        <div className="a-plan-text">
          <p className="a-eyebrow">{s.plan.eyebrow}</p>
          <h2 id="home-plan">{s.plan.title}</h2>
          <p className="a-lead-soft">{s.plan.body}</p>
        </div>
      </section>

      {s.membership.plans.length ? (
        <section className="a-member" aria-labelledby="home-member">
          <div className="wrap a-split">
            <div className="a-member-text">
              <h2 id="home-member">{s.membership.title}</h2>
              <p>{s.membership.body}</p>
              <Link className="btn a-btn-light" href={s.membership.link.href}>
                {s.membership.link.label}
              </Link>
            </div>
            <ul className="a-plans" role="list">
              {s.membership.plans.map((p, i) => (
                <li key={p.name} className={i === s.membership.plans.length - 1 ? "a-plan-hi" : undefined}>
                  <p className="a-plan-name">{p.name}</p>
                  <p className="a-plan-price">{p.price}</p>
                  <p className="a-plan-line">{p.line}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="a-strip" aria-labelledby="home-trust">
        <div className="wrap">
          <h2 id="home-trust" className="a-sr">
            {s.trust.title}
          </h2>
          <ul className="a-strip-grid" role="list">
            {s.trust.points.map((p) => (
              <li key={p.title}>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="wrap a-try" aria-labelledby="home-try">
        <div>
          <h2 id="home-try">{s.tryIt.title}</h2>
          <p>{s.tryIt.body}</p>
        </div>
        <Link className="btn secondary a-btn-ghost" href={s.tryIt.link.href}>
          {s.tryIt.link.label}
        </Link>
      </section>

      {s.authors.links.length ? (
        <section className="wrap a-authors" aria-labelledby="home-authors">
          <h2 id="home-authors">{s.authors.title}</h2>
          <ul className="a-chips" role="list">
            {s.authors.links.map((l) => (
              <li key={l.href}>
                <Link className="a-chip" href={l.href}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="a-publish" aria-labelledby="home-publish">
        <div className="wrap a-split">
          <div>
            <h2 id="home-publish">{s.publishers.title}</h2>
            <p>{s.publishers.body}</p>
          </div>
          <Link className="btn secondary a-btn-ghost" href={s.publishers.link.href}>
            {s.publishers.link.label}
          </Link>
        </div>
      </section>

      <section className="a-final" aria-labelledby="home-final">
        <div className="wrap a-final-inner">
          <h2 id="home-final">{s.finale.title}</h2>
          <p>{s.finale.body}</p>
          <Link className="btn a-btn" href={s.finale.link.href}>
            {s.finale.link.label}
          </Link>
        </div>
      </section>
    </main>
  );
}
