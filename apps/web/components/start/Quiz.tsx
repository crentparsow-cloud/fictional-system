"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOnboardingState } from "@/components/useDeviceState";
import { updateOnboarding, type KeyValueStore } from "@/lib/onboarding";
import {
  COMMITMENT_LINE,
  LENGTH_CHOICES,
  MINUTES_CHOICES,
  NOT_SURE_THEME,
  QUIZ_COPY,
  availableShelfChoices,
  progressOf,
  recommend,
  startableSignedOut,
  stepsFor,
  type QuizAnswers,
  type QuizStep,
  type Suggestion,
} from "@/lib/quiz";
import type { QuizCatalogue } from "@/lib/quiz-candidates";

type Screen = QuizStep | "results" | "commit";

function local(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Where "start" goes: the free first unit with no account, or sign-in first for a wellbeing title. */
function startHref(s: Suggestion, signedIn: boolean): string {
  const slug = s.candidate.slug;
  if (signedIn) return `/read/${slug}`;
  return startableSignedOut(s.candidate) ? `/try/${slug}` : `/sign-in?next=${encodeURIComponent(`/read/${slug}`)}`;
}

/**
 * The onboarding quiz (5.1). One question at a time, the most engaging
 * first, a progress bar from step one and a line under each question that
 * says why it is asked. Then three suggested titles, one of them startable
 * now, then one commitment screen. Answers are kept on this device only.
 * Nothing is sent anywhere and no account is needed.
 *
 * The commitment is "This week I will do two steps." It shows no deadline
 * and no date, and it is not tracked: there is no count of days and no
 * reminder attached to it.
 */
export function Quiz({ catalogue, signedIn }: { catalogue: QuizCatalogue; signedIn: boolean }) {
  // What this device remembers: a finished quiz opens on its results.
  const device = useOnboardingState();
  const [answersMade, setAnswers] = useState<QuizAnswers | null>(null);
  const [screenSet, setScreen] = useState<Screen | null>(null);
  const answers: QuizAnswers = useMemo(() => answersMade ?? device.answers ?? {}, [answersMade, device.answers]);
  const screen: Screen = screenSet ?? (device.quizDoneAt && device.answers ? "results" : "focus");
  const [chosen, setChosen] = useState<Suggestion | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  const shelfChoices = useMemo(() => availableShelfChoices(new Set(catalogue.shelves.map((s) => s.id))), [catalogue.shelves]);
  const themes = useMemo(() => catalogue.shelves.find((s) => s.id === answers.shelfId)?.themes ?? [], [catalogue.shelves, answers.shelfId]);
  const steps = useMemo(() => stepsFor({ shelfId: answers.shelfId, themesOnShelf: themes.length }), [answers.shelfId, themes.length]);
  const suggestions = useMemo(() => recommend(catalogue.candidates, answers), [catalogue.candidates, answers]);

  // Move focus to the question when the screen changes, so a screen reader hears it.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus();
  }, [screen]);

  const answer = useCallback(
    (step: QuizStep, change: QuizAnswers) => {
      const next = { ...answers, ...change };
      setAnswers(next);
      const list = stepsFor({ shelfId: next.shelfId, themesOnShelf: catalogue.shelves.find((s) => s.id === next.shelfId)?.themes.length ?? 0 });
      const at = list.indexOf(step);
      const following = list[at + 1];
      if (following) {
        setScreen(following);
      } else {
        const picks = recommend(catalogue.candidates, next);
        updateOnboarding(local(), { answers: next, suggested: picks.map((p) => p.candidate.slug), quizDoneAt: Date.now() });
        setScreen("results");
      }
    },
    [answers, catalogue.candidates, catalogue.shelves],
  );

  function back() {
    if (screen === "commit") return setScreen("results");
    if (screen === "results") return setScreen(steps[steps.length - 1] ?? "focus");
    const at = steps.indexOf(screen);
    if (at > 0) setScreen(steps[at - 1]!);
  }

  function restart() {
    setAnswers({});
    setChosen(null);
    setScreen("focus");
  }

  function commit() {
    if (!chosen) return;
    updateOnboarding(local(), { committedAt: Date.now() });
    window.location.assign(startHref(chosen, signedIn));
  }

  // ----- results and commitment -----
  if (screen === "results") {
    return (
      <section aria-labelledby="quiz-title" className="quiz-card">
        <h1 id="quiz-title" ref={heading} tabIndex={-1}>
          {suggestions.length ? "Three places to start" : "Have a look around"}
        </h1>
        {suggestions.length ? (
          <>
            <p className="muted">Picked from what you told us. Choose one. You can change your mind later.</p>
            <ul className="quiz-results">
              {suggestions.map((s) => (
                <li key={s.candidate.slug} className={`card quiz-result${s.startNow ? " is-start" : ""}`}>
                  {s.startNow ? <p className="quiz-ready">{startableSignedOut(s.candidate) ? "Ready to start now. No account needed." : "Ready to start. You will sign in first."}</p> : null}
                  <h2 className="quiz-result-title">{s.candidate.title}</h2>
                  {s.candidate.themeName ? <p className="muted small">{s.candidate.themeName}</p> : null}
                  <p>{s.candidate.cardLine}</p>
                  {s.candidate.freeLabel ? <p className="wb-card-free">{s.candidate.freeLabel}</p> : null}
                  <div className="quiz-actions">
                    <button
                      type="button"
                      className={s.startNow ? "btn" : "btn secondary"}
                      onClick={() => {
                        setChosen(s);
                        setScreen("commit");
                      }}
                    >
                      {s.startNow ? "Start with this one" : "Choose this one"}
                    </button>
                    <Link className="btn-link" href={`/w/${s.candidate.slug}`}>
                      See what is inside
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>We could not match a workbook just now. The library has everything we have.</p>
        )}
        <p className="quiz-foot">
          <Link href="/library">Browse the whole library</Link>
          {" · "}
          <button type="button" className="btn-link" onClick={restart}>
            Answer again
          </button>
        </p>
      </section>
    );
  }

  if (screen === "commit" && chosen) {
    return (
      <section aria-labelledby="quiz-title" className="quiz-card">
        <h1 id="quiz-title" ref={heading} tabIndex={-1}>
          {COMMITMENT_LINE}
        </h1>
        <p>
          Small and steady is enough.
          {answers.minutes ? ` You said about ${answers.minutes === 30 ? "30 minutes or more" : `${answers.minutes} minutes`} a day suits you, so each step is sized to fit.` : ""}
        </p>
        <div className="quiz-actions">
          <button type="button" className="btn" onClick={commit}>
            I will
          </button>
          <button type="button" className="btn secondary" onClick={back}>
            Back
          </button>
        </div>
      </section>
    );
  }

  // ----- questions -----
  const step = (steps.includes(screen as QuizStep) ? screen : "focus") as QuizStep;
  const copy = QUIZ_COPY[step];
  const { current, total, percent } = progressOf(step, steps);
  return (
    <section aria-labelledby="quiz-title" className="quiz-card">
      <div className="quiz-progress" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={current} aria-label={`Step ${current} of ${total}`}>
        <div className="quiz-progress-bar" style={{ width: `${percent}%` }} />
      </div>
      <p className="muted small quiz-step">
        Step {current} of {total}
      </p>
      <h1 id="quiz-title" ref={heading} tabIndex={-1}>
        {copy.question}
      </h1>
      <p className="muted quiz-why">{copy.why}</p>

      <div className="quiz-options" role="group" aria-labelledby="quiz-title">
        {step === "focus"
          ? shelfChoices.map((c) => (
              <button
                key={c.shelfId ?? "not-sure"}
                type="button"
                className="quiz-option"
                aria-pressed={answers.shelfId === c.shelfId && answers.shelfId !== undefined}
                onClick={() => answer("focus", { shelfId: c.shelfId, themeId: NOT_SURE_THEME })}
              >
                <span className="quiz-option-label">{c.label}</span>
                <span className="quiz-option-hint muted small">{c.hint}</span>
              </button>
            ))
          : null}
        {step === "theme"
          ? [
              ...themes.map((t) => (
                <button key={t.id} type="button" className="quiz-option" aria-pressed={answers.themeId === t.id} onClick={() => answer("theme", { themeId: t.id })}>
                  <span className="quiz-option-label">{t.name}</span>
                  {t.line ? <span className="quiz-option-hint muted small">{t.line}</span> : null}
                </button>
              )),
              <button key="any" type="button" className="quiz-option" aria-pressed={answers.themeId === NOT_SURE_THEME} onClick={() => answer("theme", { themeId: NOT_SURE_THEME })}>
                <span className="quiz-option-label">Not sure, show me what fits</span>
              </button>,
            ]
          : null}
        {step === "time"
          ? MINUTES_CHOICES.map((m) => (
              <button key={m.value} type="button" className="quiz-option" aria-pressed={answers.minutes === m.value} onClick={() => answer("time", { minutes: m.value })}>
                <span className="quiz-option-label">{m.label}</span>
              </button>
            ))
          : null}
        {step === "length"
          ? LENGTH_CHOICES.map((l) => (
              <button key={l.value} type="button" className="quiz-option" aria-pressed={answers.length === l.value} onClick={() => answer("length", { length: l.value })}>
                <span className="quiz-option-label">{l.label}</span>
              </button>
            ))
          : null}
      </div>

      <p className="quiz-foot">
        {steps.indexOf(step) > 0 ? (
          <button type="button" className="btn-link" onClick={back}>
            Back
          </button>
        ) : null}
        <span className="muted small"> Your answers stay on this device.</span>
      </p>
    </section>
  );
}
