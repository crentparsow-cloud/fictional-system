import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getReaderSession } from "@/lib/auth";
import { ShareMark } from "@/components/habit/ShareMark";
import { imageFileName } from "@/lib/habit/milestones";
import { loadHabit } from "@/lib/habit/server";
import { companionChoice, habitNotice } from "@/lib/habit/settings";
import { PACES, PACE_HINTS, PACE_LABELS } from "@/lib/pace";
import { markMarksSeen, saveHabit, savePaces } from "./actions";

/**
 * Streak, pace, companion and reminders in one place, one tap from Today
 * (11.2). Everything is the reader's choice and off or quiet until chosen.
 * The streak only works on workbooks outside the Mind and Mood shelf and the
 * higher tier (0069); the database enforces that. A reader with only such
 * workbooks sees no streak or goal controls at all.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Pace, companion and reminders" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function HabitPage({ searchParams }: Props) {
  const session = await getReaderSession();
  if (!session) redirect("/sign-in?next=/you/habit");
  const params = await searchParams;
  const notice = habitNotice(params.notice);
  const h = await loadHabit(session!.userId);
  const choice = companionChoice(h.settings.companion_on);
  const canRun = h.settings.daily_run_on || h.eligibleSteps >= h.config.offerAfter;
  const streakShown = h.anyStreakTitle || h.settings.daily_run_on;

  return (
    <section className="tab-page you-page" aria-labelledby="habit-h">
      <p className="small">
        <Link href="/today">Back to Today</Link>
      </p>
      <h1 id="habit-h">{streakShown ? "Streak, pace, companion and reminders" : "Pace, companion and reminders"}</h1>
      <p className="muted">Everything here is your choice. Nothing is compared with anyone, and nothing you have written is ever used for it.</p>
      {notice ? (
        <p className="you-notice" role="status">
          {notice}
        </p>
      ) : null}

      <form action={saveHabit} className="card you-today-card">
        {streakShown ? (
        <fieldset>
          <legend>Streak and daily goal</legend>
          {h.hasNoStreakTitle ? <p className="small muted">Nothing counts days on Mind and Mood workbooks. The streak only counts steps on other workbooks.</p> : null}
          {canRun ? (
            <>
              <div className="check">
                <input type="checkbox" id="habit-run" name="run" defaultChecked={h.settings.daily_run_on} />
                <label htmlFor="habit-run">Show a streak of the days I finish a step</label>
              </div>
              <label htmlFor="habit-goal">Steps to finish for a goal day</label>
              <select id="habit-goal" name="goal" defaultValue={String(h.settings.daily_goal)}>
                {Array.from({ length: h.config.maxGoal }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <p className="small muted">
                A few quiet days are paused for you, free, and never break it. You see your current run and your longest. The longest is kept for good.
              </p>
              {h.run ? (
                <p data-testid="habit-run-now">
                  Current <b>{h.run.current}</b> · Longest <b>{h.run.longest}</b> · {h.run.line}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <input type="hidden" name="goal" value={String(h.settings.daily_goal)} />
              <p className="small muted">
                The streak is offered after you have finished {h.config.offerAfter} steps on a workbook outside the Mind and Mood shelf.
                {h.eligibleSteps > 0 ? ` You have finished ${h.eligibleSteps} so far.` : ""}
              </p>
            </>
          )}
        </fieldset>
        ) : (
          <>
            <input type="hidden" name="goal" value={String(h.settings.daily_goal)} />
            <p className="small muted">Nothing here counts days. Your workbooks go at the pace you choose below.</p>
          </>
        )}

        <fieldset>
          <legend>Companion</legend>
          <label htmlFor="habit-companion">Show my companion on Today</label>
          <select id="habit-companion" name="companion" defaultValue={choice}>
            <option value="default">{h.hasWellbeingTitle ? "Default (off, as you have a wellbeing workbook)" : "Default (on)"}</option>
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
          <p className="small muted">It grows with the steps you finish and says a line or asks a question. It never shrinks and it never mentions time away.</p>
        </fieldset>

        <fieldset>
          <legend>Reminder time</legend>
          <div className="check">
            <input type="checkbox" id="habit-usual" name="usual" defaultChecked={h.settings.usual_time_on} />
            <label htmlFor="habit-usual">Send my reminders at the time I usually finish a step</label>
          </div>
          <p className="small muted">
            {h.usualTime
              ? `Your usual time looks like ${h.usualTime}. Until you have finished more steps, or if you switch this off, reminders use the time you set.`
              : "Akana needs a few more finished steps to work out your usual time. Until then reminders use the time you set."}
          </p>
          <p className="small">
            <Link href="/you#today-settings">Choose reminder days and time</Link>
          </p>
        </fieldset>

        <button type="submit" className="btn">
          Save
        </button>
      </form>

      {h.paces.length > 0 ? (
        <form action={savePaces} className="card you-today-card" id="pace">
          <fieldset>
            <legend>Your pace</legend>
            <p className="small muted">How often you would like to do a part of each workbook. Today and your reminders follow it. Nothing ever locks: you can always open the next part early.</p>
            {h.paces.map((p) => (
              <p key={p.enrolmentId}>
                <label htmlFor={`pace-${p.enrolmentId}`}>{p.title}</label>{" "}
                <select id={`pace-${p.enrolmentId}`} name={`pace:${p.enrolmentId}`} defaultValue={p.pace}>
                  {PACES.map((v) => (
                    <option key={v} value={v}>
                      {PACE_LABELS[v]}
                    </option>
                  ))}
                </select>
              </p>
            ))}
            <ul className="small muted">
              {PACES.map((v) => (
                <li key={v}>
                  <b>{PACE_LABELS[v]}.</b> {PACE_HINTS[v]}
                </li>
              ))}
            </ul>
          </fieldset>
          <button type="submit" className="btn">
            Save pace
          </button>
        </form>
      ) : null}

      <section className="you-section" id="marks" aria-labelledby="marks-h">
        <h2 id="marks-h">Your marks</h2>
        {h.marks.length === 0 ? (
          <p className="muted">Your first mark comes with your first finished step.</p>
        ) : (
          <>
            <div className="marks-grid">
              {h.marks.map((m) => (
                <div className="card mark-card" key={m.id}>
                  <h3>{m.name}</h3>
                  <p>{m.line}</p>
                  <ShareMark id={m.id} fileName={imageFileName(m.kind)} name={m.name} />
                </div>
              ))}
            </div>
            <p className="small muted">The picture shows the name of the mark and nothing else. It never includes a workbook title or anything you wrote.</p>
            {h.marks.some((m) => m.isNew) ? (
              <form action={markMarksSeen}>
                <button type="submit" className="btn secondary">
                  Got it
                </button>
              </form>
            ) : null}
          </>
        )}
      </section>
    </section>
  );
}
