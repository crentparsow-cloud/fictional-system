"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkbookV3 } from "@akana/schema";
import { Player, type PlayerView, type ProgressEvent } from "@akana/engine";
import { HelpNowButton } from "@/components/HelpNowButton";
import { SupabaseAnswerStore, type SaveState } from "@/components/reader/AnswerStore";
import { DraftTransfer } from "@/components/reader/DraftTransfer";
import { HardestAnswerCard } from "@/components/reader/HardestAnswerCard";
import { useFirstExerciseMark } from "@/components/reader/useDeviceOnboarding";
import { deviceDrafts, enrolmentBucket } from "@/lib/draft-store";
import { hardestCardKey, sensitiveFieldKeys, shouldShowHardestCard } from "@/components/reader/hardest-answer";
import { PaywallCard } from "@/components/reader/PaywallCard";
import { paywallState, unitCountPhrase, type PaywallInput } from "@/components/reader/paywall";
import { PauseBar } from "@/components/reader/PauseBar";
import { SaveStatus } from "@/components/reader/SaveStatus";
import { WeekLine } from "@/components/today/WeekLine";
import type { OpenAt } from "@/lib/today/links";
import { doneExerciseIds, nextStep, stepsFromWorkbook } from "@/lib/today/steps";
import { countedFinishes, rhythmLine, rhythmUnit, thisWeekMarked, type StepEvent } from "@/lib/today/week";
import { acknowledgeHigherTier, saveReadingPlace, type PlaceInput } from "./actions";

interface Props {
  workbook: WorkbookV3;
  enrolmentId: string;
  lockedUnits: number[];
  missing: Array<"toolkit" | "finish" | "keep_going">;
  slug: string;
  /** The reader's market code, for Help now. "XX" means everywhere else. */
  market: string;
  paywall: Omit<PaywallInput, "entitled">;
  /** Stored progress events for this enrolment, ids and timestamps only. */
  events?: ProgressEvent[];
  /** A view a link asked for, such as the daily check from Today. */
  openView?: "daily" | "plan" | "progress" | "toolkit" | "finish" | "keep_going" | null;
  /** The higher-tier "I have read this", as stored server side for this enrolment and version (0026). */
  acknowledged?: boolean;
  /** An account deletion is pending: the work opens, nothing can be added (F-025). */
  readOnly?: boolean;
  /** Open on this unit, step and field (Today, reminders, a paused place). */
  place?: OpenAt | null;
}

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage blocked: the card or the note may simply show again
  }
}

/**
 * Client half of the reader. Loads the sealed answers for this enrolment,
 * hands the Player a store that autosaves, shows the save line, and records
 * progress events (ids and timestamps only, F-020) on unit open, exercise
 * done, check-in saved and daily check saved. An event never carries an
 * answer, a score or a feeling: the check-in ref is the unit number and the
 * daily check sends no ref at all, so no date ends up in the row's ref.
 */
export function ReadClient({ workbook, enrolmentId, lockedUnits, missing, slug, market, paywall, events, openView, acknowledged: acknowledgedOnServer = false, readOnly = false, place = null }: Props) {
  const [store, setStore] = useState<SupabaseAnswerStore | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [acknowledged, setAcknowledged] = useState(acknowledgedOnServer);
  const [hardest, setHardest] = useState(false);
  // 14.6: unsaved answers kept on the device until the server confirms them.
  const [recovered, setRecovered] = useState(0);
  const [draftIssue, setDraftIssue] = useState<"quota" | "unavailable" | null>(null);
  const markFirstExercise = useFirstExerciseMark();
  const lastUnit = useRef<number | null>(null);
  const placeRef = useRef<PlaceInput | null>(null);
  const placeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [liveEvents, setLiveEvents] = useState<StepEvent[]>([]);
  const higher = workbook.safety_tier === "higher";
  const wellbeing = workbook.safety_tier !== "none";
  const helpMarket = market === "XX" ? null : market;

  // The hardest answer card: at most weekly, on this device, never sent anywhere.
  const sensitive = useMemo(() => sensitiveFieldKeys(workbook), [workbook]);
  const onSaved = useCallback(
    (field: string) => {
      if (!wellbeing || !sensitive.size) return;
      const key = hardestCardKey(enrolmentId);
      const last = Number(readLocal(key));
      const now = Date.now();
      if (shouldShowHardestCard({ field, sensitive, lastShownAt: last > 0 ? last : null, now })) {
        writeLocal(key, String(now));
        setHardest(true);
      }
    },
    [enrolmentId, sensitive, wellbeing],
  );

  useEffect(() => {
    let cancelled = false;
    SupabaseAnswerStore.load({
      enrolmentId,
      onStatus: setSaveState,
      onSaved,
      currentUnit: () => lastUnit.current,
      drafts: readOnly ? null : deviceDrafts(),
      draftBucket: enrolmentBucket(enrolmentId),
      onDraftIssue: setDraftIssue,
      onRecovered: setRecovered,
    })
      .then((s) => {
        if (cancelled) return;
        setStore(s);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enrolmentId, onSaved, readOnly]);

  // Send anything owed when the tab goes away.
  useEffect(() => {
    if (!store) return;
    const onHide = () => store.flush();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [store]);

  const record = useCallback(
    (kind: "unit_opened" | "step_done" | "checkin_done" | "daily_check_done" | "toolkit_used" | "finished", ref?: string) => {
      // Read only (F-025): the database would refuse it anyway.
      if (readOnly) return;
      if (kind === "step_done" && ref) setLiveEvents((prev) => [...prev, { kind, ref, at: new Date().toISOString() }]);
      // A step done carries the unit it was done in, for the per-unit count
      // only (0036). The event itself stores ids and a time, as ever.
      const unit = kind === "step_done" && lastUnit.current != null ? { unit: lastUnit.current } : {};
      void fetch("/api/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(ref === undefined ? { enrolment: enrolmentId, kind, ...unit } : { enrolment: enrolmentId, kind, ref, ...unit }),
        keepalive: true,
      }).catch(() => undefined);
    },
    [enrolmentId, readOnly],
  );

  // Pause and save (14.5). The place is kept as the reader moves, a moment
  // after they stop, and at once when they press Pause. Ids only.
  const onPlace = useCallback(
    (p: { unit: number; exerciseId: string | null; page: string | null; fieldId: string | null; mode: "full" | "short" | null }) => {
      placeRef.current = { unit: p.unit, exerciseId: p.exerciseId, page: p.page, fieldId: p.fieldId, mode: p.mode };
      if (readOnly) return;
      if (placeTimer.current) clearTimeout(placeTimer.current);
      placeTimer.current = setTimeout(() => {
        if (placeRef.current) void saveReadingPlace(enrolmentId, placeRef.current, false).catch(() => undefined);
      }, 1500);
    },
    [enrolmentId, readOnly],
  );
  const pause = useCallback(async (): Promise<boolean> => {
    if (placeTimer.current) clearTimeout(placeTimer.current);
    store?.flush();
    const p = placeRef.current;
    if (!p || readOnly) return true;
    try {
      return await saveReadingPlace(enrolmentId, p, true);
    } catch {
      return false;
    }
  }, [enrolmentId, readOnly, store]);

  const onViewChange = useCallback(
    (view: PlayerView) => {
      if (view.kind !== "unit" || view.number === lastUnit.current) return;
      lastUnit.current = view.number;
      if (lockedUnits.includes(view.number)) return;
      record("unit_opened", String(view.number));
    },
    [lockedUnits, record],
  );

  // The ref is the answer scope: the exercise id, or "<id>~r" for a repeat, so
  // first_repeat can be told apart (F-018). The partner stage check in 0012
  // matches plain ids, so a repeat ref adds nothing there.
  const onExerciseDone = useCallback(
    (_exerciseId: string, scope: string) => {
      record("step_done", scope);
      markFirstExercise();
    },
    [record, markFirstExercise],
  );
  const onToolUsed = useCallback((toolId: string) => record("toolkit_used", toolId), [record]);
  const onFinished = useCallback(() => record("finished"), [record]);
  const onCheckInDone = useCallback((unitNumber: number) => record("checkin_done", String(unitNumber)), [record]);
  const onDailyCheckDone = useCallback(() => record("daily_check_done"), [record]);

  // Kept server side (0026). If the save fails the reader is still let in
  // for this visit and simply sees the note again next time.
  const onAcknowledge = useCallback(() => {
    setAcknowledged(true);
    void acknowledgeHigherTier(enrolmentId).catch(() => undefined);
  }, [enrolmentId]);

  // Help now, one tap away on every screen of a wellbeing workbook (F-021).
  const helpSlot = wellbeing ? <HelpNowButton market={helpMarket} /> : null;

  // The calm paywall (F-019). A locked unit is one the entitlement does not cover.
  const offer = paywallState({ entitled: false, ...paywall });
  const lockedNotice =
    offer.kind === "open" ? null : (
      <PaywallCard
        state={offer}
        slug={slug}
        unitWord={unitWord(workbook)}
        fullLength={unitCountPhrase(workbook.structure.count, workbook.structure.unit)}
      />
    );

  // A finished reader opens on Keep going; a link may ask for one view.
  const finished = (events ?? []).some((e) => e.kind === "finished");
  const usable =
    openView === "daily" ? !!workbook.daily_check : openView === "keep_going" ? !!workbook.keep_going : openView === "plan" ? workbook.plan_sections.length > 0 : !!openView;
  const initialView: PlayerView | undefined = openView && usable
    ? openView === "toolkit"
      ? { kind: "toolkit" }
      : { kind: openView }
    : place && workbook.units.some((u) => u.number === place.unit)
      ? { kind: "unit", number: place.unit }
      : finished && workbook.keep_going
        ? { kind: "keep_going" }
        : undefined;
  const initialOpen =
    !openView && place?.exerciseId
      ? { exerciseId: place.exerciseId, ...(place.mode ? { mode: place.mode } : {}), ...(place.page ? { page: place.page } : {}), ...(place.fieldId ? { fieldId: place.fieldId } : {}) }
      : undefined;

  // The weekly rhythm (4.2): a line and a mark for this week, never a streak.
  const steps = useMemo(() => stepsFromWorkbook(workbook), [workbook]);

  if (loadError) {
    return (
      <section className="read-page">
        <p className="muted">Your answers could not be loaded just now. Reload the page to try again.</p>
      </section>
    );
  }

  if (!store) {
    return (
      <section className="read-page" aria-busy="true">
        <p className="muted">Opening your workbook.</p>
      </section>
    );
  }

  const allEvents: StepEvent[] = [...(events ?? []).map((e) => ({ kind: e.kind, ref: e.ref, at: e.at })), ...liveEvents];
  const upNext = rhythmUnit(steps, nextStep(steps, doneExerciseIds(allEvents)));
  const finishes = countedFinishes(steps, allEvents, (exerciseId, fieldId) => store.get(exerciseId, fieldId) !== undefined);
  const browserZone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return undefined;
    }
  })();

  return (
    <section className="read-page">
      <div className="read-head">
        <SaveStatus state={saveState} />
        {missing.length ? <span className="muted" style={{ fontSize: "0.85rem" }}>Some parts open with the full workbook.</span> : null}
      </div>
      {upNext ? (
        <WeekLine
          line={rhythmLine({ unitWord: workbook.structure.unit, unit: upNext.unit, unitCount: workbook.structure.count, stepsInUnit: upNext.stepsInUnit })}
          marked={thisWeekMarked(finishes, new Date(), browserZone)}
        />
      ) : null}
      <DraftTransfer slug={slug} store={store} />
      {recovered ? (
        <p className="muted small" role="status">
          {recovered === 1 ? "1 answer you wrote earlier was not saved. It is being saved now." : `${recovered} answers you wrote earlier were not saved. They are being saved now.`}
        </p>
      ) : null}
      {draftIssue === "quota" ? (
        <p className="muted small" role="status">
          This device is full, so a backup copy of your latest answer could not be kept. Your answers are still being saved to your account.
        </p>
      ) : null}
      {hardest ? <HardestAnswerCard market={helpMarket} onClose={() => setHardest(false)} /> : null}
      <Player
        workbook={workbook}
        store={store}
        helpSlot={helpSlot}
        lockedUnits={lockedUnits}
        lockedNotice={lockedNotice}
        onViewChange={onViewChange}
        onExerciseDone={onExerciseDone}
        onCheckInDone={onCheckInDone}
        onDailyCheckDone={onDailyCheckDone}
        onToolUsed={onToolUsed}
        onFinished={onFinished}
        events={events}
        buyHref={paywall.demo ? undefined : `/go/${encodeURIComponent(slug)}`}
        initialView={initialView}
        requireAcknowledge={higher}
        acknowledged={acknowledged}
        onAcknowledge={onAcknowledge}
        readOnly={readOnly}
        pagedExercises
        initialOpen={initialOpen}
        onPlace={onPlace}
      />
      <PauseBar onPause={pause} disabled={readOnly} />
    </section>
  );
}

function unitWord(doc: WorkbookV3): string {
  return { week: "week", day: "day", module: "module", chapter: "chapter" }[doc.structure.unit];
}
