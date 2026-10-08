"use client";

import type { WorkbookV3 } from "@akana/schema";
import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { dailyScope, earnedMilestones, localDay, milestoneText, progressFacts, selfcheckScope, type CurrentStep, type ProgressEvent } from "./progress";
import { START_SCOPE } from "./store";
import { CheckInScreen } from "./screens/CheckIn";
import { DailyCheckScreen, emptyDailyCheck, type DailyCheckValue } from "./screens/DailyCheck";
import { FinishScreen } from "./screens/Finish";
import { KeepGoingScreen } from "./screens/KeepGoing";
import { PlanScreen } from "./screens/Plan";
import { ProgressScreen } from "./screens/Progress";
import { SelfCheckScreen, type SelfCheckAnswers } from "./screens/SelfCheck";
import { StartScreen } from "./screens/Start";
import { ToolkitScreen } from "./screens/Toolkit";
import { UnitScreen } from "./screens/Unit";
import { unitLabel } from "./screens/parts";
import type { AnswerStore } from "./types";

export type PlayerView =
  | { kind: "start" }
  | { kind: "unit"; number: number }
  | { kind: "toolkit"; focus?: string }
  | { kind: "daily" }
  | { kind: "checkin"; number: number }
  | { kind: "selfcheck"; number: number | null }
  | { kind: "plan" }
  | { kind: "progress" }
  | { kind: "finish" }
  | { kind: "keep_going" };

export interface PlayerProps {
  workbook: WorkbookV3;
  store: AnswerStore;
  /**
   * Filled by the app for wellbeing tiers with its Help now control. The
   * Player only reserves the slot. It is rendered at the top of every screen.
   */
  helpSlot?: ReactNode;
  /** Skip the Start screen. Useful when a reader has already read it. */
  initialView?: PlayerView;
  readOnly?: boolean;
  /**
   * Units the reader may not open yet. The app decides this from
   * entitlements; the Player only swaps the unit's content for lockedNotice.
   */
  lockedUnits?: readonly number[];
  /** Shown in place of a locked unit's exercises. */
  lockedNotice?: ReactNode;
  /** Called after every view change, so the app can record "unit opened" and the like. */
  onViewChange?: (view: PlayerView) => void;
  /** Called when the reader marks an exercise done. scope is the answer scope (the id, or the repeat scope). */
  onExerciseDone?: (exerciseId: string, scope: string) => void;
  /** Called once each time the reader saves a check-in, with its unit number. Ids only, never the answers. */
  onCheckInDone?: (unitNumber: number) => void;
  /**
   * Called once each time the reader saves the daily check. Never the score
   * or the tags. When set, the daily check screen shows its Save button.
   */
  onDailyCheckDone?: () => void;
  /** Called when the reader presses "I used it" on a tool, with the tool id. When set, the buttons show. */
  onToolUsed?: (toolId: string) => void;
  /** Called when the reader marks the workbook finished. When set, the Finish screen offers it. */
  onFinished?: () => void;
  /**
   * Progress events already stored for this enrolment (ids and timestamps
   * only). The Player adds its own as the reader works, to show progress
   * and milestones without a reload. Nothing here counts days in a row.
   */
  events?: readonly ProgressEvent[];
  /** The /go/ link for the book, shown on the Finish screen. */
  buyHref?: string;
  /**
   * Higher-tier workbooks (F-022): the reader must press "I have read this"
   * on the Start screen before any unit opens. While unacknowledged the
   * Player stays on Start whatever initialView says. Defaults to false.
   */
  requireAcknowledge?: boolean;
  /** Already acknowledged for this enrolment, as the app stored it. */
  acknowledged?: boolean;
  /** Called when the reader presses "I have read this", so the app can store it. */
  onAcknowledge?: () => void;
  /**
   * Page through each exercise one part per screen, with Back and Next and
   * progress dots, as the legacy app did (F-015). Off by default.
   */
  pagedExercises?: boolean;
}

/**
 * A simple controller for a v3 workbook: the Start screen, then one unit at a
 * time with its exercises, plus the Toolkit, daily check, check-in,
 * self-check, My plan, Progress, Finish and Keep going. Sealing and
 * unlocking are the app's job. Nothing here counts streaks or missed days.
 */
export function Player({
  workbook: doc,
  store,
  helpSlot,
  initialView,
  readOnly,
  lockedUnits,
  lockedNotice,
  onViewChange,
  onExerciseDone,
  onCheckInDone,
  onDailyCheckDone,
  onToolUsed,
  onFinished,
  events: initialEvents,
  buyHref,
  requireAcknowledge,
  acknowledged,
  onAcknowledge,
  pagedExercises,
}: PlayerProps) {
  const [acked, setAcked] = useState<boolean>(!!acknowledged);
  const gated = !!requireAcknowledge && !acked && !acknowledged;
  const [viewState, setView] = useState<PlayerView>(initialView ?? { kind: "start" });
  // A gated reader sees Start until they acknowledge it, whatever was asked for.
  const view: PlayerView = gated ? { kind: "start" } : viewState;

  useEffect(() => {
    onViewChange?.(view);
    // The app records views, not every render: only the view identity matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.kind, "number" in view ? view.number : null]);
  const [tick, bump] = useReducer((n: number) => n + 1, 0);
  const [daily, setDaily] = useState<DailyCheckValue>(emptyDailyCheck);
  const [dailySaved, setDailySaved] = useState(false);
  const [events, setEvents] = useState<ProgressEvent[]>(() => [...(initialEvents ?? [])]);
  const [notice, setNotice] = useState<string | null>(null);

  // Writes go straight to the store. The Player re-renders so the screens read the new value.
  const liveStore: AnswerStore = {
    get: (s, f) => store.get(s, f),
    set: (s, f, v) => {
      store.set(s, f, v);
      bump();
    },
  };

  // Progress and milestones are worked out from events and answers, never stored.
  const facts = useMemo(
    () => progressFacts(doc, events, store),
    // tick changes whenever an answer does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, events, store, tick],
  );
  const earnedIds = useRef<Set<string> | null>(null);
  if (earnedIds.current === null) earnedIds.current = new Set(earnedMilestones(doc, facts).map((m) => m.id));

  // A welcome back after a break, once per open. Never a reproach, never a count.
  useEffect(() => {
    const welcome = doc.milestones.find((m) => m.trigger === "return_after_gap");
    if (!welcome || !initialEvents?.length) return;
    const last = [...initialEvents].sort((a, b) => b.at.localeCompare(a.at))[0];
    if (last && Date.now() - Date.parse(last.at) >= 7 * 86_400_000) setNotice(milestoneText(doc, welcome, facts));
    // Once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Record an event locally, then show the first milestone it newly earns. */
  const note = (kind: ProgressEvent["kind"], ref: string | null) => {
    const next = [...events, { kind, ref, at: new Date().toISOString() }];
    setEvents(next);
    announce(next);
  };
  const announce = (evts: readonly ProgressEvent[]) => {
    const f = progressFacts(doc, evts, store);
    const now = earnedMilestones(doc, f);
    const seen = earnedIds.current ?? new Set<string>();
    // return_after_gap is only ever the welcome on open.
    const fresh = now.find((m) => !seen.has(m.id) && m.trigger !== "return_after_gap");
    for (const m of now) seen.add(m.id);
    earnedIds.current = seen;
    if (fresh) setNotice(milestoneText(doc, fresh, f));
  };

  const units = [...doc.units].sort((a, b) => a.number - b.number);
  const current = view.kind === "unit" ? units.find((u) => u.number === view.number) : undefined;
  const currentLocked = current !== undefined && (lockedUnits ?? []).includes(current.number);
  const whyRaw = store.get(START_SCOPE, "why");
  const why = typeof whyRaw === "string" ? whyRaw : "";
  const toolkitTitles = doc.toolkit.map((t) => t.title);
  const unitWord = { week: "Week", day: "Day", module: "Module", chapter: "Chapter" }[doc.structure.unit];

  const go = (target: PlayerView) => {
    setNotice(null);
    setView(target);
  };
  const navButton = (label: string, target: PlayerView, active: boolean) => (
    <button type="button" className="ak-nav-btn" aria-pressed={active} onClick={() => go(target)}>
      {label}
    </button>
  );
  const isActive = (kind: PlayerView["kind"]) => view.kind === kind;

  const selfcheckAnswers = (n: number | null): SelfCheckAnswers => {
    const scope = selfcheckScope(n ?? 0);
    const out: SelfCheckAnswers = {};
    for (const i of doc.selfcheck?.items ?? []) {
      const v = store.get(scope, i.id);
      if (typeof v === "number") out[i.id] = v;
    }
    return out;
  };

  const openStep = (step: CurrentStep) => {
    if (step.kind === "exercise" || step.kind === "locked") go({ kind: "unit", number: step.unit });
    else if (step.kind === "checkin") go({ kind: "checkin", number: step.unit });
    else if (step.kind === "selfcheck") go({ kind: "selfcheck", number: step.unit });
    else go({ kind: "finish" });
  };

  return (
    <div className="ak-player" data-safety-tier={doc.safety_tier}>
      <header className="ak-player-head">
        <div className="ak-player-title">
          <span className="ak-eyebrow">{doc.short_title ?? doc.title}</span>
          {doc.is_demo ? <span className="ak-badge ak-badge-demo">Demo</span> : null}
        </div>
        <div className="ak-help-slot">{helpSlot}</div>
      </header>

      {view.kind !== "start" ? (
        <nav className="ak-player-nav" aria-label="Workbook">
          <div className="ak-nav-row">
            {navButton(unitWord + "s", { kind: "unit", number: current?.number ?? 1 }, isActive("unit"))}
            {doc.toolkit.length ? navButton("Toolkit", { kind: "toolkit" }, isActive("toolkit")) : null}
            {doc.daily_check ? navButton("Daily check", { kind: "daily" }, isActive("daily")) : null}
            {doc.selfcheck ? navButton("Self-check", { kind: "selfcheck", number: null }, isActive("selfcheck")) : null}
            {doc.plan_sections.length ? navButton("My plan", { kind: "plan" }, isActive("plan")) : null}
            {navButton("Progress", { kind: "progress" }, isActive("progress"))}
            {navButton("Finish", { kind: "finish" }, isActive("finish"))}
            {doc.keep_going ? navButton("Keep going", { kind: "keep_going" }, isActive("keep_going")) : null}
            {navButton("Start", { kind: "start" }, false)}
          </div>
          {view.kind === "unit" || view.kind === "checkin" ? (
            <div className="ak-unit-picker">
              <label className="ak-small ak-muted" htmlFor="ak-unit-select">
                {unitWord}
              </label>
              <select
                id="ak-unit-select"
                className="ak-select"
                value={view.number}
                onChange={(e) => go({ kind: "unit", number: Number(e.target.value) })}
              >
                {units.map((u) => (
                  <option key={u.number} value={u.number}>
                    {unitLabel(doc, u.number)}: {u.focus}
                    {facts.done.size && u.exercise_ids.length && u.exercise_ids.every((id) => facts.done.has(id)) ? " (done)" : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </nav>
      ) : null}

      {notice ? (
        <div className="ak-milestone" aria-live="polite">
          <p>{notice}</p>
          <button type="button" className="ak-btn ak-btn-quiet" onClick={() => setNotice(null)}>
            Close
          </button>
        </div>
      ) : null}

      <main className="ak-player-body">
        {view.kind === "start" ? (
          <StartScreen
            workbook={doc}
            why={why}
            readOnly={readOnly}
            onWhyChange={(w) => liveStore.set(START_SCOPE, "why", w)}
            showFirstTool={doc.toolkit.length > 0}
            onOpenSelfCheck={!gated && doc.selfcheck && !facts.selfchecks.has(0) ? () => go({ kind: "selfcheck", number: null }) : undefined}
            onAcknowledge={() => {
              setAcked(true);
              onAcknowledge?.();
              go({ kind: "unit", number: units[0]?.number ?? 1 });
            }}
          />
        ) : null}

        {view.kind === "unit" && current && currentLocked ? (
          <section className="ak-screen ak-unit ak-unit-locked" data-unit={current.number}>
            <header className="ak-unit-head">
              <span className="ak-eyebrow">{unitLabel(doc, current.number)}</span>
              <h2 className="ak-h2">{current.focus}</h2>
            </header>
            {lockedNotice}
          </section>
        ) : null}

        {view.kind === "unit" && current && !currentLocked ? (
          <UnitScreen
            key={current.number}
            paged={pagedExercises}
            workbook={doc}
            unit={current}
            store={liveStore}
            readOnly={readOnly}
            done={facts.done}
            onExerciseDone={(id, scope) => {
              onExerciseDone?.(id, scope);
              note("step_done", scope);
            }}
            onOpenCheckIn={doc.checkin ? () => go({ kind: "checkin", number: current.number }) : undefined}
            onOpenSelfCheck={doc.selfcheck ? () => go({ kind: "selfcheck", number: current.number }) : undefined}
            onOpenTool={doc.toolkit.length ? (toolId) => go({ kind: "toolkit", focus: toolId }) : undefined}
          />
        ) : null}
        {view.kind === "unit" && !current ? <p className="ak-muted">That {unitWord.toLowerCase()} is not in this workbook.</p> : null}

        {view.kind === "toolkit" ? (
          <ToolkitScreen
            toolkit={doc.toolkit}
            focusId={view.focus}
            onUse={
              onToolUsed && !readOnly
                ? (id) => {
                    onToolUsed(id);
                    note("toolkit_used", id);
                  }
                : undefined
            }
          />
        ) : null}

        {view.kind === "daily" && doc.daily_check ? (
          <DailyCheckScreen
            dailyCheck={doc.daily_check}
            value={daily}
            onChange={(v) => {
              setDailySaved(false);
              setDaily(v);
            }}
            readOnly={readOnly}
            onSave={
              onDailyCheckDone
                ? () => {
                    // The score and what helped are the reader's own answer, saved
                    // sealed like any other, one per day (a second save that day
                    // replaces the first, as in the legacy app). The event that
                    // follows carries neither.
                    const scope = dailyScope(localDay(new Date()));
                    liveStore.set(scope, "score", daily.score);
                    liveStore.set(scope, "tags", daily.tags.map((i) => doc.daily_check?.tags[i]).filter((t): t is string => typeof t === "string"));
                    // Clearing the value disables Save again, so one press is one event.
                    setDaily(emptyDailyCheck());
                    setDailySaved(true);
                    onDailyCheckDone();
                    note("daily_check_done", null);
                  }
                : undefined
            }
          />
        ) : null}
        {view.kind === "daily" && dailySaved ? (
          <p className="ak-small ak-muted" role="status">
            Saved.
          </p>
        ) : null}

        {view.kind === "checkin" && doc.checkin ? (
          <CheckInScreen
            checkin={doc.checkin}
            unitNumber={view.number}
            unitLabel={unitLabel(doc, view.number)}
            store={liveStore}
            toolkitTitles={toolkitTitles}
            readOnly={readOnly}
            onSave={() => {
              onCheckInDone?.(view.number);
              note("checkin_done", String(view.number));
              setView({ kind: "unit", number: view.number });
            }}
          />
        ) : null}

        {view.kind === "selfcheck" && doc.selfcheck ? (
          <SelfCheckScreen
            selfcheck={doc.selfcheck}
            eyebrow={view.number === null ? "Your starting self-check" : `${unitLabel(doc, view.number)} self-check`}
            answers={selfcheckAnswers(view.number)}
            onChange={(a) => {
              // Each item is saved as the reader's own answer, sealed like any other.
              const scope = selfcheckScope(view.number ?? 0);
              for (const i of doc.selfcheck?.items ?? []) {
                const next = a[i.id];
                const prev = store.get(scope, i.id);
                const value = typeof next === "number" ? next : null;
                if ((typeof prev === "number" ? prev : null) !== value) liveStore.set(scope, i.id, value);
              }
            }}
            readOnly={readOnly}
            onFinish={() => {
              announce(events);
              setView(view.number === null ? { kind: "unit", number: units[0]?.number ?? 1 } : { kind: "unit", number: view.number });
            }}
          />
        ) : null}

        {view.kind === "plan" ? <PlanScreen workbook={doc} store={liveStore} readOnly={readOnly} /> : null}

        {view.kind === "progress" ? (
          <ProgressScreen workbook={doc} facts={facts} events={events} store={store} onOpenStep={openStep} onOpenPlan={doc.plan_sections.length ? () => go({ kind: "plan" }) : undefined} />
        ) : null}

        {view.kind === "finish" ? (
          <FinishScreen
            workbook={doc}
            buyHref={buyHref}
            finished={facts.finished}
            onFinished={
              onFinished && !readOnly
                ? () => {
                    onFinished();
                    note("finished", null);
                  }
                : undefined
            }
            onOpenPlan={doc.plan_sections.length ? () => go({ kind: "plan" }) : undefined}
            onOpenKeepGoing={doc.keep_going ? () => go({ kind: "keep_going" }) : undefined}
          />
        ) : null}

        {view.kind === "keep_going" ? (
          <KeepGoingScreen
            workbook={doc}
            store={liveStore}
            readOnly={readOnly}
            onOpenExercise={(id) => {
              const u = units.find((x) => x.exercise_ids.includes(id));
              if (u) go({ kind: "unit", number: u.number });
            }}
          />
        ) : null}
      </main>
    </div>
  );
}
