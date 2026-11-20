"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkbookV3 } from "@akana/schema";
import { Player, type PlayerView, type ProgressEvent } from "@akana/engine";
import { HelpNowButton } from "@/components/HelpNowButton";
import { SupabaseAnswerStore, type SaveDetail, type SaveState } from "@/components/reader/AnswerStore";
import { SaveStatus } from "@/components/reader/SaveStatus";
import { deviceDrafts, enrolmentBucket } from "@/lib/draft-store";
import { recordProgress, startProgressQueue } from "@/lib/progress-client";

interface Props {
  workbook: WorkbookV3;
  enrolmentId: string;
  lockedUnits: number[];
  /** What a locked part says: nothing is sold on a tenant site yet. */
  lockedLine: string;
  /** Stored progress events for this enrolment, ids and timestamps only. */
  events: ProgressEvent[];
  /** An account deletion is pending: the work opens, nothing can be added (F-025). */
  readOnly: boolean;
}

/**
 * The reader on a tenant site (F-133): the same Player, answers and progress
 * as the Akana reader, and nothing else. It talks to two routes only,
 * /api/answers and /api/progress, which are the two reader routes a tenant
 * host serves. No paywall, pace, marks, friends, reminders or recommendations:
 * none of those exist on a tenant host.
 *
 * Answers autosave sealed (F-134). Progress events carry ids and times only
 * (F-020): the check-in ref is the unit number and the daily check sends no
 * ref. Nothing here counts a streak. The higher-tier note is shown on each
 * visit and acknowledged for that visit.
 */
export function TenantReadClient({ workbook, enrolmentId, lockedUnits, lockedLine, events, readOnly }: Props) {
  const [store, setStore] = useState<SupabaseAnswerStore | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveDetail, setSaveDetail] = useState<SaveDetail>({ cause: null, savedAt: null });
  const [acknowledged, setAcknowledged] = useState(false);
  const lastUnit = useRef<number | null>(null);
  const wellbeing = workbook.safety_tier !== "none";

  useEffect(() => {
    let cancelled = false;
    SupabaseAnswerStore.load({
      enrolmentId,
      onStatus: (st, detail) => {
        setSaveState(st);
        setSaveDetail(detail);
      },
      currentUnit: () => lastUnit.current,
      drafts: readOnly ? null : deviceDrafts(),
      draftBucket: enrolmentBucket(enrolmentId),
    })
      .then((s) => {
        if (!cancelled) setStore(s);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enrolmentId, readOnly]);

  // Send progress left on this device by an earlier page.
  useEffect(() => {
    startProgressQueue();
  }, []);

  // Send anything owed when the tab goes away.
  useEffect(() => {
    if (!store) return;
    const onHide = () => store.flush();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [store]);

  const record = useCallback(
    (kind: "unit_opened" | "step_done" | "checkin_done" | "daily_check_done" | "toolkit_used" | "finished", ref?: string) => {
      if (readOnly) return;
      recordProgress({ enrolmentId, kind, ...(ref === undefined ? {} : { ref }) });
    },
    [enrolmentId, readOnly],
  );

  const onViewChange = useCallback(
    (view: PlayerView) => {
      if (view.kind !== "unit" || view.number === lastUnit.current) return;
      lastUnit.current = view.number;
      if (lockedUnits.includes(view.number)) return;
      record("unit_opened", String(view.number));
    },
    [lockedUnits, record],
  );
  const onExerciseDone = useCallback((_exerciseId: string, scope: string) => record("step_done", scope), [record]);
  const onToolUsed = useCallback((toolId: string) => record("toolkit_used", toolId), [record]);
  const onFinished = useCallback(() => record("finished"), [record]);
  const onCheckInDone = useCallback((unitNumber: number) => record("checkin_done", String(unitNumber)), [record]);
  const onDailyCheckDone = useCallback(() => record("daily_check_done"), [record]);

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

  const finished = events.some((e) => e.kind === "finished");
  return (
    <section className="read-page">
      <div className="read-head">
        <SaveStatus state={saveState} cause={saveDetail.cause} savedAt={saveDetail.savedAt} onRetry={() => store.retryNow()} keptOnDevice={saveState === "device"} />
      </div>
      <Player
        workbook={workbook}
        store={store}
        helpSlot={wellbeing ? <HelpNowButton /> : null}
        lockedUnits={lockedUnits}
        lockedNotice={
          <div className="card" role="note">
            <p>{lockedLine}</p>
          </div>
        }
        onViewChange={onViewChange}
        onExerciseDone={onExerciseDone}
        onCheckInDone={onCheckInDone}
        onDailyCheckDone={onDailyCheckDone}
        onToolUsed={onToolUsed}
        onFinished={onFinished}
        events={events}
        initialView={finished && workbook.keep_going ? { kind: "keep_going" } : undefined}
        requireAcknowledge={workbook.safety_tier === "higher"}
        acknowledged={acknowledged}
        onAcknowledge={() => setAcknowledged(true)}
        readOnly={readOnly}
        pagedExercises
      />
    </section>
  );
}
