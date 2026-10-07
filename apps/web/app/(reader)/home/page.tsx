import type { Metadata } from "next";
import Link from "next/link";
import { ContinueCardView } from "@/components/catalogue/ContinueCardView";
import { HelpNowButton } from "@/components/HelpNowButton";
import { NeedSupportFooter } from "@/components/NeedSupportFooter";
import { getReaderSession } from "@/lib/auth";
import { myEnrolments } from "@/lib/catalogue";
import { anyWellbeing, splitContinueCards } from "@/lib/continue-cards";
import { getT } from "@/lib/i18n";
import { finishedEnrolments } from "@/lib/reader-progress";

/**
 * Home (F-016): a continue card per open workbook, capped at three, the rest
 * under a link to the Library. Help now sits at the top when any open
 * workbook is a wellbeing title; otherwise the quiet footer link.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("nav.home") };
}

export default async function HomePage() {
  const { t } = await getT();
  const session = await getReaderSession();
  const cards = session ? await myEnrolments(session.userId) : [];
  const { shown, hidden } = splitContinueCards(cards);
  const wellbeing = anyWellbeing(cards);
  const finished = await finishedEnrolments(shown.map((c) => c.enrolmentId));

  return (
    <section className="tab-page">
      <div className="page-head">
        <h1>{t("nav.home")}</h1>
        {wellbeing ? <HelpNowButton label={t("help.now")} /> : null}
      </div>

      {shown.length === 0 ? (
        <div className="card empty-state">
          <p>{t("home.empty")}</p>
          <p className="muted">{t("home.line")}</p>
          <Link className="btn" href="/library">
            {t("home.browse")}
          </Link>
        </div>
      ) : (
        <>
          <h2 className="section-title">{t("home.continue")}</h2>
          <div className="grid wb-grid">
            {shown.map((card) => (
              <ContinueCardView key={card.enrolmentId} card={card} t={t} finished={finished.has(card.enrolmentId)} />
            ))}
          </div>
          <p className="muted see-all">
            {hidden > 0 ? <>{t("home.moreInLibrary", { count: hidden })} </> : null}
            <Link href="/library">{t("home.seeAll")}</Link>
          </p>
        </>
      )}

      {!wellbeing ? <NeedSupportFooter label={t("help.needSupport")} /> : null}
    </section>
  );
}
