import Link from "next/link";
import { acceptRunOffer, declineRunOffer, markMarksSeen } from "@/app/(reader)/you/habit/actions";
import { Companion } from "@/components/habit/Companion";
import { OnThisDay } from "@/components/habit/OnThisDay";
import type { HabitView, OnThisDayView } from "@/lib/habit/server";

/**
 * The habit layer on Today (4.4, 4.5, 4.6, 11.2, "On this day"). Everything
 * here is quiet: the companion, a note when a new mark is earned, the
 * streak as two small figures once the reader has chosen it, and one link to
 * the settings. The streak and its offer never reach a mental health title:
 * the database only counts steps on titles outside the wellbeing tiers.
 */
export function HabitPanel({ habit, onThisDay, readOnly = false }: { habit: HabitView; onThisDay: OnThisDayView | null; readOnly?: boolean }) {
  const newMarks = habit.marks.filter((m) => m.isNew);
  return (
    <div className="habit-panel" data-testid="habit-panel">
      {habit.companion ? <Companion view={habit.companion} /> : null}

      {newMarks.length > 0 ? (
        <section className="card marks-note" aria-label="New marks">
          <p>
            <b>{newMarks.map((m) => m.name).join(", ")}.</b> {newMarks[newMarks.length - 1]!.line}
          </p>
          <div className="you-actions-row">
            <Link className="btn secondary" href="/you/habit#marks">
              See and share
            </Link>
            {!readOnly ? (
              <form action={markMarksSeen}>
                <button type="submit" className="btn secondary">
                  Got it
                </button>
              </form>
            ) : null}
          </div>
        </section>
      ) : null}

      {onThisDay ? <OnThisDay view={onThisDay} /> : null}

      {habit.run ? (
        <p className="run-line small" data-testid="run-line">
          <span>
            Streak <b>{habit.run.current}</b>
          </span>
          <span className="muted"> · Longest {habit.run.longest}</span>
          <span className="muted"> · {habit.run.line}</span>
        </p>
      ) : null}

      {habit.offer && !readOnly ? (
        <section className="card habit-offer" aria-labelledby="habit-offer-h">
          <h2 id="habit-offer-h">Count your finished steps?</h2>
          <p>
            You have finished a few steps. If it helps, Akana can show a quiet streak that counts the days you finish one. Pauses are automatic and free, so a few quiet days never
            break it. It is never compared with anyone, and you can turn it off at any time.
          </p>
          <div className="you-actions-row">
            <form action={acceptRunOffer}>
              <button type="submit" className="btn">
                Turn it on
              </button>
            </form>
            <form action={declineRunOffer}>
              <button type="submit" className="btn secondary">
                Not now
              </button>
            </form>
          </div>
        </section>
      ) : null}

      <p className="small habit-link">
        <Link href="/you/habit">{habit.hasWellbeingTitle && !habit.run ? "Companion and reminders" : "Streak and reminders"}</Link>
      </p>
    </div>
  );
}
