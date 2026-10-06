"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkbookV3 } from "@akana/schema";
import { Player, type PlayerView } from "@akana/engine";
import { SupabaseAnswerStore, type SaveState } from "@/components/reader/AnswerStore";
import { SaveStatus } from "@/components/reader/SaveStatus";

interface Props {
  workbook: WorkbookV3;
  enrolmentId: string;
  lockedUnits: number[];
  missing: Array<"toolkit" | "finish" | "keep_going">;
  slug: string;
}

/**
 * Client half of the reader. Loads the sealed answers for this enrolment,
 * hands the Player a store that autosaves, shows the save line, and records
 * progress events (ids and timestamps only) on unit open and exercise done.
 */
export function ReadClient({ workbook, enrolmentId, lockedUnits, missing }: Props) {
  const [store, setStore] = useState<SupabaseAnswerStore | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const lastUnit = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    SupabaseAnswerStore.load({ enrolmentId, onStatus: setSaveState })
      .then((s) => {
        if (!cancelled) setStore(s);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enrolmentId]);

  // Send anything owed when the tab goes away.
  useEffect(() => {
    if (!store) return;
    const onHide = () => store.flush();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [store]);

  const record = useCallback(
    (kind: "unit_opened" | "step_done", ref: string) => {
      void fetch("/api/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enrolment: enrolmentId, kind, ref }),
        keepalive: true,
      }).catch(() => undefined);
    },
    [enrolmentId],
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

  const onExerciseDone = useCallback((exerciseId: string) => record("step_done", exerciseId), [record]);

  const helpSlot =
    workbook.safety_tier !== "none" ? (
      <Link href="/help-now" className="btn help">
        Help now
      </Link>
    ) : null;

  const lockedNotice = (
    <div className="read-locked" role="note">
      <p>This {unitWord(workbook)} opens with the full workbook.</p>
      <p className="muted">Your free {unitWord(workbook)} and your answers stay here whatever you decide.</p>
      <Link href="/library" className="btn secondary">
        Back to your library
      </Link>
    </div>
  );

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

  return (
    <section className="read-page">
      <div className="read-head">
        <SaveStatus state={saveState} />
        {missing.length ? <span className="muted" style={{ fontSize: "0.85rem" }}>Some parts open with the full workbook.</span> : null}
      </div>
      <Player
        workbook={workbook}
        store={store}
        helpSlot={helpSlot}
        lockedUnits={lockedUnits}
        lockedNotice={lockedNotice}
        onViewChange={onViewChange}
        onExerciseDone={onExerciseDone}
      />
    </section>
  );
}

function unitWord(doc: WorkbookV3): string {
  return { week: "week", day: "day", module: "module", chapter: "chapter" }[doc.structure.unit];
}
