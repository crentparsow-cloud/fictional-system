"use client";

import type { WorkbookV3 } from "@akana/schema";
import {
  currentStep,
  earnedMilestones,
  milestoneText,
  recentDailyChecks,
  unitsDone,
  type CurrentStep,
  type ProgressEvent,
  type ProgressFacts,
} from "../progress";
import type { AnswerStore } from "../types";
import { Card, Eyebrow, unitLabel } from "./parts";

export interface ProgressScreenProps {
  workbook: WorkbookV3;
  facts: ProgressFacts;
  events: readonly ProgressEvent[];
  /** Opens the step named in "Where you are". */
  onOpenStep?: (step: CurrentStep) => void;
  onOpenPlan?: () => void;
  /** The reader's answers, to show their own daily ratings back to them. */
  store?: AnswerStore;
  /** For tests. */
  now?: Date;
}

/**
 * Progress without streaks (F-018). Units done, the current step,
 * milestones, My plan lines and a plain list of recent daily checks. No
 * streak, no run of days, no missed-day count and no comparison with anyone
 * else. A day with no check is shown as a plain day.
 */
export function ProgressScreen({ workbook: doc, facts, events, onOpenStep, onOpenPlan, store, now }: ProgressScreenProps) {
  const done = unitsDone(doc, facts);
  const step = currentStep(doc, facts);
  const earned = earnedMilestones(doc, facts);
  const unitWord = { week: "weeks", day: "days", module: "modules", chapter: "chapters" }[doc.structure.unit];
  const days = doc.daily_check ? recentDailyChecks(events, 14, now, store) : [];
  const dayLabel = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

  const stepLine =
    step.kind === "exercise"
      ? `${unitLabel(doc, step.unit)}: ${step.title}${step.repeat ? " (comes back)" : ""}`
      : step.kind === "checkin"
        ? `${unitLabel(doc, step.unit)}: check-in`
        : step.kind === "selfcheck"
          ? `${unitLabel(doc, step.unit)}: self-check`
          : step.kind === "locked"
            ? `${unitLabel(doc, step.unit)} opens with the full workbook`
            : facts.finished
              ? "Finished. Keep going whenever you like."
              : "Everything is done. The finish is ready for you.";

  return (
    <section className="ak-screen ak-progress">
      <header>
        <h2 className="ak-h2">Progress</h2>
        <p className="ak-muted">Where you are, in your own time. Only you see this.</p>
      </header>

      <Card>
        <Eyebrow>Where you are</Eyebrow>
        <p>{stepLine}</p>
        {onOpenStep && step.kind !== "locked" ? (
          <button type="button" className="ak-btn ak-btn-secondary" onClick={() => onOpenStep(step)}>
            {step.kind === "finish" ? "Open the finish" : "Go there"}
          </button>
        ) : null}
      </Card>

      <Card>
        <Eyebrow>
          {unitWord.charAt(0).toUpperCase() + unitWord.slice(1)} done
        </Eyebrow>
        <p>
          {done.length} of {doc.structure.count}
        </p>
        <ul className="ak-plain-list ak-unit-list">
          {[...doc.units]
            .sort((a, b) => a.number - b.number)
            .map((u) => (
              <li key={u.number} className="ak-small" data-done={done.includes(u.number)}>
                <span className="ak-unit-mark" aria-hidden="true">
                  {done.includes(u.number) ? "✓" : ""}
                </span>
                {unitLabel(doc, u.number)}: {u.focus}
                {done.includes(u.number) ? <span className="ak-visually-hidden">, done</span> : null}
              </li>
            ))}
        </ul>
      </Card>

      <Card>
        <Eyebrow>Milestones</Eyebrow>
        {earned.length ? (
          <ul className="ak-plain-list">
            {earned.map((m) => (
              <li key={m.id} className="ak-small">
                {milestoneText(doc, m, facts)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ak-small ak-muted">Your first one comes after your first exercise.</p>
        )}
      </Card>

      {doc.plan_sections.length ? (
        <Card>
          <Eyebrow>My plan</Eyebrow>
          <p>
            {facts.planLines === 0
              ? "No lines yet. It fills in as you go."
              : facts.planLines === 1
                ? "1 line in your own words."
                : `${facts.planLines} lines in your own words.`}
          </p>
          {onOpenPlan ? (
            <button type="button" className="ak-btn ak-btn-secondary" onClick={onOpenPlan}>
              Open My plan
            </button>
          ) : null}
        </Card>
      ) : null}

      {doc.daily_check ? (
        <Card>
          <Eyebrow>Recent daily checks</Eyebrow>
          <ul className="ak-plain-list ak-daily-days">
            {days.map((d) => (
              <li key={d.date} className="ak-small" data-checked={d.checked}>
                <span>{dayLabel(d.date)}</span>
                <span>
                  {d.checked ? (typeof d.score === "number" ? `${d.score} out of 10` : "Checked") : ""}
                  {d.tags?.length ? <span className="ak-muted">. {d.tags.join(", ")}</span> : null}
                </span>
              </li>
            ))}
          </ul>
          <p className="ak-small ak-muted">The last two weeks. A blank day is just a day, and that is fine.</p>
        </Card>
      ) : null}
    </section>
  );
}
