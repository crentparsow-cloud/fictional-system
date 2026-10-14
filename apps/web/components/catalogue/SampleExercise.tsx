"use client";

import { useEffect, useMemo, useState } from "react";
import { ExerciseScreen } from "@akana/engine";
import type { WorkbookV3 } from "@akana/schema";
import "@akana/engine/engine.css";
import { DeviceAnswerStore } from "@/components/reader/AnswerStore";
import { deviceDrafts, tryBucket } from "@/lib/draft-store";

/**
 * One exercise to try in place on the workbook page (3.1). The answers are
 * held on this device in the same drafts the free first unit uses
 * (tryBucket), so they are still there when the visitor starts the workbook.
 * Nothing is sent anywhere.
 */
export function SampleExercise({ slug, exercise, toolkitTitles }: { slug: string; exercise: WorkbookV3["exercises"][number]; toolkitTitles: string[] }) {
  const [store, setStore] = useState<DeviceAnswerStore | null>(null);
  const drafts = useMemo(() => deviceDrafts(), []);
  useEffect(() => {
    let cancelled = false;
    DeviceAnswerStore.load(drafts, tryBucket(slug)).then((s) => {
      if (!cancelled) setStore(s);
    });
    return () => {
      cancelled = true;
    };
  }, [drafts, slug]);
  useEffect(() => {
    if (!store) return;
    const onHide = () => store.flush();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [store]);

  if (!store) return <p className="muted small" aria-busy="true">Opening the example.</p>;
  return (
    <div className="wb-sample ak-player">
      <ExerciseScreen exercise={exercise} store={store} toolkitTitles={toolkitTitles} eyebrow="A short example" paged />
      <p className="small muted">What you write here stays on this device until you choose to keep it.</p>
    </div>
  );
}
