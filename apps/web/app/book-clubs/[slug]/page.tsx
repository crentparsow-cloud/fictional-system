import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NeedSupportFooter } from "@/components/NeedSupportFooter";
import { bookClubEligible, bookClubPath, DISCUSSION_PROMPTS, GROUND_RULES, meetingCount, meetingLabel, meetingPlan, RUN_STEPS } from "@/lib/book-club";
import { brand } from "@/lib/brand";
import { unitWord } from "@/lib/catalogue-guard";
import { getWorkbookBySlug } from "@/lib/catalogue";
import { getT } from "@/lib/i18n";
import { publicRobots } from "@/lib/indexing";
import { breadcrumbLd, ldString } from "@/lib/public-seo";
import { siteOrigin } from "@/lib/site-url";

/**
 * "Run this with your book club" (14.16), one page per programme. Built from
 * the public programme page: the title, the card line and the outline focus
 * lines, grouped into meetings. No exercise text and no answers. Wellbeing,
 * demo and outline-only titles have no club page (404).
 */
export const dynamic = "force-dynamic";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getWorkbookBySlug(slug).catch(() => null);
  if (!detail || !bookClubEligible(detail.card)) return { title: "Book club", robots: { index: false, follow: false } };
  return {
    title: `Run this with your book club: ${detail.card.title}`,
    description: `A plan for running ${detail.card.title} with a book club: ${meetingCount(meetingPlan(detail.listing?.outline ?? []).length)}, ground rules and questions.`,
    alternates: { canonical: bookClubPath(slug) },
    robots: publicRobots(),
  };
}

export default async function BookClubProgrammePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const [detail, { t }] = await Promise.all([getWorkbookBySlug(slug), getT()]);
  if (!detail || !bookClubEligible(detail.card)) notFound();
  const { card, listing } = detail;
  const word = unitWord(detail);
  const meetings = meetingPlan(listing?.outline ?? []);
  const origin = siteOrigin();
  const ld = breadcrumbLd(origin, [
    { name: brand.name, path: "/" },
    { name: "Book clubs", path: "/book-clubs" },
    { name: card.title, path: bookClubPath(card.slug) },
  ]);

  return (
    <main className="b-clubs">
      <header className="b-band-hero">
        <div className="wrap b-centre">
          <nav className="b-crumbs" aria-label="Breadcrumb">
            <Link href="/">{brand.name}</Link> <span aria-hidden="true">/</span> <Link href="/book-clubs">Book clubs</Link>
          </nav>
          <h1>Run this with your book club</h1>
          <p className="b-lead">{card.title}</p>
          <p className="b-soft">
            {card.cardLine} {meetings.length ? meetingCount(meetings.length) + "." : ""}
          </p>
          <p className="b-actions b-actions-centre">
            <Link className="btn" href={`/w/${card.slug}`}>
              See the programme
            </Link>
          </p>
        </div>
      </header>

      <div className="wrap b-body b-narrow-body">
        <section className="b-psec" aria-labelledby="bcp-how">
          <h2 id="bcp-how">How to run it</h2>
          <ol className="b-list b-list-n">
            {RUN_STEPS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>

        {meetings.length ? (
          <section className="b-psec" aria-labelledby="bcp-plan">
            <h2 id="bcp-plan">Meeting by meeting</h2>
            <ol className="b-weeks b-weeks-one">
              {meetings.map((m) => (
                <li key={m.number} className="b-week">
                  <h3>{meetingLabel(m, word)}</h3>
                  <p>{m.units.map((u) => u.focus).join("; ")}</p>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <section className="b-psec" aria-labelledby="bcp-rules">
          <h2 id="bcp-rules">Ground rules</h2>
          <ul className="b-list">
            {GROUND_RULES.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>

        <section className="b-psec" aria-labelledby="bcp-questions">
          <h2 id="bcp-questions">Questions for each meeting</h2>
          <ul className="b-list">
            {DISCUSSION_PROMPTS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>

        <section className="b-psec" aria-labelledby="bcp-start">
          <h2 id="bcp-start">Before you meet</h2>
          <p>
            The first {word.toLowerCase()} is free for everyone, so each member can try it before the group decides. Each person opens it from the programme page.
          </p>
          <p>
            Running the group for a church, a charity or a team? <Link href="/organisations">See Akana for organisations</Link>.
          </p>
        </section>

        <footer className="b-notes">
          <p>{brand.wellnessNotice}</p>
        </footer>
        <NeedSupportFooter label={t("help.needSupport")} />
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldString(ld) }} />
    </main>
  );
}
