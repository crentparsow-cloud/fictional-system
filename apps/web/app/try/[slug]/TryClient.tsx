"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { WorkbookV3 } from "@akana/schema";
import { Player } from "@akana/engine";
import { DeviceAnswerStore, type SaveState } from "@/components/reader/AnswerStore";
import { SaveStatus } from "@/components/reader/SaveStatus";
import { useFirstExerciseMark } from "@/components/reader/useDeviceOnboarding";
import { deviceDrafts, tryBucket } from "@/lib/draft-store";

interface Props {
  workbook: WorkbookV3;
  slug: string;
  /** Units that need an account or a purchase. The first unit is never among them. */
  lockedUnits: number[];
  missing: Array<"toolkit" | "finish" | "keep_going">;
  /** The soft sign-in wall, rendered on the server so Google sign-in can sit in it. */
  wall: ReactNode;
}

/**
 * The free first unit for a visitor with no account (5.2). The same Player
 * the signed-in reader uses, with an AnswerStore that keeps answers in the
 * device's IndexedDB drafts and sends nothing to the server. When the visitor
 * reaches a unit that needs an account, the soft wall stands in its place:
 * "Save your answers", Google first, then a sign-in link. After sign-in the
 * reader offers these drafts to the account (ReadClient, DraftTransfer).
 *
 * Wellbeing titles never come here: consent to store health information
 * needs an account, so /try sends them to sign-in first.
 */
export function TryClient({ workbook, slug, lockedUnits, missing, wall }: Props) {
  const [store, setStore] = useState<DeviceAnswerStore | null>(null);
  const [state, setState] = useState<SaveState>("idle");
  const markFirstExercise = useFirstExerciseMark();
  const drafts = useMemo(() => deviceDrafts(), []);

  useEffect(() => {
    let cancelled = false;
    DeviceAnswerStore.load(drafts, tryBucket(slug), setState).then((s) => {
      if (!cancelled) setStore(s);
    });
    return () => {
      cancelled = true;
    };
  }, [drafts, slug]);

  // Write what is owed when the tab goes away.
  useEffect(() => {
    if (!store) return;
    const onHide = () => store.flush();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [store]);

  if (!store) {
    return (
      <section className="read-page" aria-busy="true">
        <p className="muted">Opening your first unit.</p>
      </section>
    );
  }

  return (
    <section className="read-page">
      <div className="read-head">
        <SaveStatus state={state} />
        {missing.length ? <span className="muted small">Some parts open with an account.</span> : null}
      </div>
      <Player
        workbook={workbook}
        store={store}
        lockedUnits={lockedUnits}
        lockedNotice={wall}
        onExerciseDone={() => markFirstExercise()}
        pagedExercises
      />
    </section>
  );
}
