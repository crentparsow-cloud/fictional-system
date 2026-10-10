import type { Metadata } from "next";
import Link from "next/link";
import { GroupWeekLine } from "@/components/groups/GroupWeekLine";
import { HelpNowButton } from "@/components/HelpNowButton";
import { NeedSupportFooter } from "@/components/NeedSupportFooter";
import { CalendarReminder } from "@/components/today/CalendarReminder";
import { DailyQuickTap } from "@/components/today/DailyQuickTap";
import { NightNote } from "@/components/today/NightNote";
import { NotToday } from "@/components/today/NotToday";
import { ReviewPanel } from "@/components/today/ReviewPanel";
import { TodayCards } from "@/components/today/TodayCards";
import { WeekLine } from "@/components/today/WeekLine";
import { readerDeletion } from "@/lib/account-server";
import { getReaderSession } from "@/lib/auth";
import { withDailyCheck } from "@/lib/continue-cards";
import { getT } from "@/lib/i18n";
import { createUserClient } from "@/lib/supabase/server";
import { loadTodayView, type TodayView } from "@/lib/today/server";

/**
 * Today (4.1, 4.2, 4.3, 4.9, 12.10): three cards at most. Today's step (the
 * next unfinished step of the programme the reader is on, with a calm
 * "about N minutes"), one card from the toolkit if the reader saved any, and
 * one suggestion. For the first 30 days of a membership the third card is
 * the next programme to try. Under them, the weekly rhythm ("Week 3 of 8.
 * Two steps this week.") and, if the reader switched it on, one earlier
 * answer of their own with an optional "still true?".
 *
 * After a gap of 14 days or more the step card turns into a welcome back:
 * where they were and one easy step, with an optional, skippable line about
 * what got in the way. Nothing here counts days, shows a streak or says
 * anything was missed. Wellbeing titles (tier standard or higher) have the
 * review, the welcome back and every email off until the reader turns them
 * on from You.
 *
 * The daily check for workbooks that carry one stays as it was (F-016). One
 * calendar reminder for everything (F-024), made on the device.
 *
 * /today/go is the address to bookmark: it opens straight to the step.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("nav.today") };
}

export default async function TodayPage() {
  const { t } = await getT();
  const session = await getReaderSession();
  const view: TodayView | null = session ? await loadTodayView(session.userId).catch(() => null) : null;
  const daily = view ? withDailyCheck(view.continueCards) : [];
  const { readOnly } = session ? await readerDeletion(await createUserClient(), session.userId) : { readOnly: false };
  const wellbeing = view?.wellbeing ?? false;

  return (
    <section className="tab-page">
      <div className="page-head">
        <h1>{t("nav.today")}</h1>
        {wellbeing ? <HelpNowButton label={t("help.now")} /> : null}
      </div>
      {session ? <GroupWeekLine /> : null}

      {!view || view.cards.length === 0 ? (
        <div className="card empty-state">
          <p>{t("today.empty")}</p>
          <Link className="btn" href="/library">
            {t("home.browse")}
          </Link>
        </div>
      ) : (
        <>
          <NightNote />
          {!view.hasProgrammes ? <p className="muted">{t("today.empty")}</p> : null}
          {view.rhythm ? <WeekLine line={view.rhythm.line} marked={view.rhythm.marked} /> : null}
          <NotToday label={t("today.notToday")} doneLine={t("today.notTodayDone")} showLabel={t("today.showAnyway")}>
            <TodayCards cards={view.cards} hrefs={view.hrefs} welcomeBack={view.welcomeBack} readOnly={readOnly} />
          </NotToday>
          {view.review ? (
            <ReviewPanel
              enrolmentId={view.review.enrolmentId}
              answerId={view.review.answerId}
              question={view.review.question}
              text={view.review.text}
              day={view.review.stillTrueDay}
              readOnly={readOnly}
            />
          ) : null}
        </>
      )}

      {view && daily.length > 0 ? (
        <section className="card daily-check" aria-labelledby="daily-check-title">
          <h2 id="daily-check-title">{t("today.dailyCheck")}</h2>
          <p className="muted">{t("today.dailyCheckLead")}</p>
          <ul className="daily-list quick-tap-list">
            {daily.map((card) => (
              <li key={card.enrolmentId}>
                <DailyQuickTap
                  enrolmentId={card.enrolmentId}
                  slug={card.slug}
                  title={card.shortTitle ?? card.title}
                  question={t("today.quickTap")}
                  lead={t("today.quickTapLead")}
                  moreLabel={t("today.quickTapMore")}
                  readOnly={readOnly}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {view?.hasProgrammes ? <CalendarReminder /> : null}

      {!wellbeing ? <NeedSupportFooter label={t("help.needSupport")} /> : null}
    </section>
  );
}
