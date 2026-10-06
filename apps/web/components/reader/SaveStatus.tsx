"use client";

import type { SaveState } from "./AnswerStore";

const COPY: Record<SaveState, string> = {
  idle: "",
  saving: "Saving",
  saved: "Saved",
  retrying: "Could not save, will retry",
  failed: "Could not save this answer",
};

/**
 * One quiet line that says whether the reader's answers are safe. Polite
 * live region, so a screen reader hears "Saved" without being interrupted.
 */
export function SaveStatus({ state }: { state: SaveState }) {
  return (
    <p className="save-status" data-state={state} role="status" aria-live="polite">
      {COPY[state]}
    </p>
  );
}
