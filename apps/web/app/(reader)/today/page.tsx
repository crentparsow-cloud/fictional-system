import type { Metadata } from "next";
import Link from "next/link";
import { ContinueCardView } from "@/components/catalogue/ContinueCardView";
import { HelpNowButton } from "@/components/HelpNowButton";
import { NeedSupportFooter } from "@/components/NeedSupportFooter";
import { getReaderSession } from "@/lib/auth";
import { myEnrolments } from "@/lib/catalogue";
import { anyWellbeing, splitContinueCards, withDailyCheck } from "@/lib/continue-cards";
import { getT } from "@/lib/i18n";

/**
 * Today (F-016): the same continue cards as Home, plus the daily check
 * prompt only for workbooks whose start section carries a daily_check. A
 * finance reader never gets a mood question. No reminders of missed days.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("nav.today") };
}

export default async function TodayPage() {
  const { t } = await getT();
  const session = await getReaderSession();
  const cards = session ? await myEnrolments(session.userId) : [];
  const { shown, hidden } = splitContinueCards(cards);
  const daily = withDailyCheck(cards);
  const wellbeing = anyWellbeing(cards);

  return (
    <section className="tab-page">
      <div className="page-head">
        <h1>{t("nav.today")}</h1>
        {wellbeing ? <HelpNowButton label={t("help.now")} /> : null}
      </div>

      {cards.length === 0 ? (
        <div className="card empty-state">
          <p>{t("today.empty")}</p>
          <Link className="btn" href="/library">
            {t("home.browse")}
          </Link>
        </div>
      ) : (
        <>
          {daily.length > 0 ? (
            <section className="card daily-check" aria-labelledby="daily-check-title">
              <h2 id="daily-check-title">{t("today.dailyCheck")}</h2>
              <p className="muted">{t("today.dailyCheckLead")}</p>
              <ul className="daily-list">
                {daily.map((card) => (
                  <li key={card.enrolmentId}>
                    <span>{card.shortTitle ?? card.title}</span>
                    <Link href={`/read/${card.slug}`}>{t("today.dailyCheckOpen")}</Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <h2 className="section-title">{t("home.continue")}</h2>
          <div className="grid wb-grid">
            {shown.map((card) => (
              <ContinueCardView key={card.enrolmentId} card={card} t={t} />
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
