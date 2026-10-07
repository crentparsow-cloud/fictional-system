import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkbookCard } from "@/components/catalogue/WorkbookCard";
import { HelpNowButton } from "@/components/HelpNowButton";
import { NeedSupportFooter } from "@/components/NeedSupportFooter";
import { cardsByTheme, workbookCount } from "@/lib/author-theme-pages";
import { getTheme } from "@/lib/author-theme-queries";
import { brand } from "@/lib/brand";
import { listLibrary } from "@/lib/catalogue";
import { getT } from "@/lib/i18n";

/**
 * A Theme page (F-007) at /themes/{slug}: the Theme's plain line and every
 * live workbook on it from any author. Emails link here because they never
 * name a title, so a Theme with nothing live yet still renders. Public and
 * server rendered like /w/{slug}. Hidden topics are never read.
 */
export const dynamic = "force-dynamic";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const theme = await getTheme(slug);
  if (!theme) return { title: "Theme" };
  return {
    title: theme.name,
    description: theme.line ?? `Guided workbooks on ${theme.name}, from every author on ${brand.name}.`,
    alternates: { canonical: `/themes/${theme.id}` },
  };
}

export default async function ThemePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const [theme, { t }] = await Promise.all([getTheme(slug), getT()]);
  if (!theme) notFound();
  const cards = cardsByTheme(await listLibrary({ theme: theme.id }), theme.id);
  const wellbeing = cards.some((c) => c.safetyTier !== "none");

  return (
    <main className="wb-page browse-page">
      <header className="wb-hero">
        <div className="wrap">
          <nav className="wb-crumbs" aria-label="Breadcrumb">
            <Link href="/">{brand.name}</Link> <span aria-hidden="true">/</span> <Link href="/themes">Themes</Link>
          </nav>
          {theme.shelfName ? <p className="browse-eyebrow">{theme.shelfName}</p> : null}
          <h1>{theme.name}</h1>
          {theme.line ? <p className="wb-line">{theme.line}</p> : null}
          <p className="muted small">{cards.length ? workbookCount(cards.length) : "New workbooks are on the way"}</p>
          {wellbeing ? (
            <div className="wb-actions">
              <HelpNowButton label={t("help.now")} />
            </div>
          ) : null}
        </div>
      </header>

      <div className="wrap wb-body">
        {cards.length ? (
          <section aria-labelledby="theme-workbooks">
            <h2 id="theme-workbooks" className="browse-heading">
              Workbooks on this Theme
            </h2>
            <div className="grid wb-grid">
              {cards.map((card) => (
                <WorkbookCard key={card.id} card={card} outlineOnlyLabel={t("library.outlineOnly")} openLabel={t("library.open")} />
              ))}
            </div>
          </section>
        ) : (
          <section className="empty-state browse-empty">
            <h2 className="browse-heading">Nothing here yet</h2>
            <p>No workbooks are live on this Theme yet. They appear here as soon as they are published.</p>
            <Link className="btn secondary" href="/themes">
              See every Theme
            </Link>
          </section>
        )}

        <p className="browse-more">
          <Link href="/themes">More Themes</Link>
        </p>

        <footer className="footer wb-footer">
          <p>{brand.wellnessNotice}</p>
        </footer>
        {!wellbeing ? <NeedSupportFooter label={t("help.needSupport")} /> : null}
      </div>
    </main>
  );
}
