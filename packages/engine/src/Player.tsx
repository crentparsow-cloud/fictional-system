"use client";

import type { WorkbookV3 } from "@akana/schema";
import { useEffect, useReducer, useState, type ReactNode } from "react";
import { START_SCOPE } from "./store";
import { CheckInScreen } from "./screens/CheckIn";
import { DailyCheckScreen, emptyDailyCheck, type DailyCheckValue } from "./screens/DailyCheck";
import { FinishScreen } from "./screens/Finish";
import { KeepGoingScreen } from "./screens/KeepGoing";
import { SelfCheckScreen, type SelfCheckAnswers } from "./screens/SelfCheck";
import { StartScreen } from "./screens/Start";
import { ToolkitScreen } from "./screens/Toolkit";
import { UnitScreen } from "./screens/Unit";
import { unitLabel } from "./screens/parts";
import type { AnswerStore } from "./types";

export type PlayerView =
  | { kind: "start" }
  | { kind: "unit"; number: number }
  | { kind: "toolkit" }
  | { kind: "daily" }
  | { kind: "checkin"; number: number }
  | { kind: "selfcheck"; number: number | null }
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
}

/**
 * A simple controller for a v3 workbook: the Start screen, then one unit at a
 * time with its exercises, plus the Toolkit, daily check, check-in,
 * self-check, Finish and Keep going. Progress, sealing and unlocking are the
 * app's job. Nothing here counts streaks or missed days.
 */
export function Player({ workbook: doc, store, helpSlot, initialView, readOnly, lockedUnits, lockedNotice, onViewChange, onExerciseDone }: PlayerProps) {
  const [view, setView] = useState<PlayerView>(initialView ?? { kind: "start" });

  useEffect(() => {
    onViewChange?.(view);
    // The app records views, not every render: only the view identity matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.kind, "number" in view ? view.number : null]);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [daily, setDaily] = useState<DailyCheckValue>(emptyDailyCheck);
  const [selfcheck, setSelfcheck] = useState<Record<string, SelfCheckAnswers>>({});

  // Writes go straight to the store. The Player re-renders so the screens read the new value.
  const liveStore: AnswerStore = {
    get: (s, f) => store.get(s, f),
    set: (s, f, v) => {
      store.set(s, f, v);
      bump();
    },
  };

  const units = [...doc.units].sort((a, b) => a.number - b.number);
  const current = view.kind === "unit" ? units.find((u) => u.number === view.number) : undefined;
  const currentLocked = current !== undefined && (lockedUnits ?? []).includes(current.number);
  const whyRaw = store.get(START_SCOPE, "why");
  const why = typeof whyRaw === "string" ? whyRaw : "";
  const toolkitTitles = doc.toolkit.map((t) => t.title);
  const unitWord = { week: "Week", day: "Day", module: "Module", chapter: "Chapter" }[doc.structure.unit];

  const navButton = (label: string, target: PlayerView, active: boolean) => (
    <button type="button" className="ak-nav-btn" aria-pressed={active} onClick={() => setView(target)}>
      {label}
    </button>
  );

  const isActive = (kind: PlayerView["kind"]) => view.kind === kind;

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
                onChange={(e) => setView({ kind: "unit", number: Number(e.target.value) })}
              >
                {units.map((u) => (
                  <option key={u.number} value={u.number}>
                    {unitLabel(doc, u.number)}: {u.focus}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </nav>
      ) : null}

      <main className="ak-player-body">
        {view.kind === "start" ? (
          <StartScreen
            workbook={doc}
            why={why}
            readOnly={readOnly}
            onWhyChange={(w) => liveStore.set(START_SCOPE, "why", w)}
            onAcknowledge={() => setView({ kind: "unit", number: units[0]?.number ?? 1 })}
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
            workbook={doc}
            unit={current}
            store={liveStore}
            readOnly={readOnly}
            onExerciseDone={onExerciseDone ?? (() => undefined)}
            onOpenCheckIn={doc.checkin ? () => setView({ kind: "checkin", number: current.number }) : undefined}
            onOpenSelfCheck={doc.selfcheck ? () => setView({ kind: "selfcheck", number: current.number }) : undefined}
          />
        ) : null}
        {view.kind === "unit" && !current ? <p className="ak-muted">That {unitWord.toLowerCase()} is not in this workbook.</p> : null}

        {view.kind === "toolkit" ? <ToolkitScreen toolkit={doc.toolkit} /> : null}

        {view.kind === "daily" && doc.daily_check ? (
          <DailyCheckScreen dailyCheck={doc.daily_check} value={daily} onChange={setDaily} readOnly={readOnly} />
        ) : null}

        {view.kind === "checkin" && doc.checkin ? (
          <CheckInScreen
            checkin={doc.checkin}
            unitNumber={view.number}
            unitLabel={unitLabel(doc, view.number)}
            store={liveStore}
            toolkitTitles={toolkitTitles}
            readOnly={readOnly}
            onSave={() => setView({ kind: "unit", number: view.number })}
          />
        ) : null}

        {view.kind === "selfcheck" && doc.selfcheck ? (
          <SelfCheckScreen
            selfcheck={doc.selfcheck}
            eyebrow={view.number === null ? "Your starting self-check" : `${unitLabel(doc, view.number)} self-check`}
            answers={selfcheck[String(view.number)] ?? {}}
            onChange={(a) => setSelfcheck({ ...selfcheck, [String(view.number)]: a })}
            readOnly={readOnly}
            onFinish={() => setView(view.number === null ? { kind: "unit", number: units[0]?.number ?? 1 } : { kind: "unit", number: view.number })}
          />
        ) : null}

        {view.kind === "finish" ? (
          <FinishScreen workbook={doc} onOpenKeepGoing={doc.keep_going ? () => setView({ kind: "keep_going" }) : undefined} />
        ) : null}

        {view.kind === "keep_going" ? (
          <KeepGoingScreen
            workbook={doc}
            store={liveStore}
            readOnly={readOnly}
            onOpenExercise={(id) => {
              const u = units.find((x) => x.exercise_ids.includes(id));
              if (u) setView({ kind: "unit", number: u.number });
            }}
          />
        ) : null}
      </main>
    </div>
  );
}
