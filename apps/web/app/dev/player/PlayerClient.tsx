"use client";

import { useMemo } from "react";
import type { WorkbookV3 } from "@akana/schema";
import { MemoryAnswerStore, Player } from "@akana/engine";

/**
 * Client half of the dev preview. The store lives in memory for the life of
 * the page, so answers vanish on reload. The Help now slot shows a plain
 * placeholder here; the app supplies the real control for wellbeing tiers.
 */
export function PlayerClient({ workbook }: { workbook: WorkbookV3 }) {
  const store = useMemo(() => new MemoryAnswerStore(), []);
  const helpSlot =
    workbook.safety_tier !== "none" ? (
      <button type="button" className="btn help" onClick={() => window.alert("Help now opens the safety hub in the app.")}>
        Help now
      </button>
    ) : null;
  // Paged like the reader app (F-015 parity).
  return <Player workbook={workbook} store={store} helpSlot={helpSlot} pagedExercises />;
}
