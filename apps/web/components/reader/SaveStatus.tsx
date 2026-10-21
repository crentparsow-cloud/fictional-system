"use client";

import { useEffect, useState } from "react";
import { saveLine, type SaveCause } from "@/lib/reading/autosave";
import type { SaveState } from "./AnswerStore";

interface Props {
  state: SaveState;
  /** Why the last save failed, for the retrying line. */
  cause?: SaveCause | null;
  /** When a save last went through, so "Saved just now" can fade to "Saved". */
  savedAt?: number | null;
  /** Send what is owed now. When given, the retrying line shows a Retry button. */
  onRetry?: () => void;
  /** The latest words are also held on this device (offline draft recovery). */
  keptOnDevice?: boolean;
}

/**
 * One quiet line, always in the same spot, that says whether the reader's
 * answers are safe (3.7): Unsaved changes, Saving, Saved just now, or
 * Couldn't save, retrying with the cause and a Retry button. A polite live
 * region, so a screen reader hears the change without being interrupted.
 */
export function SaveStatus({ state, cause = null, savedAt = null, onRetry, keptOnDevice = false }: Props) {
  // Re-read the clock while "Saved just now" is showing, so it settles to "Saved" by itself.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (state !== "saved") return;
    const id = window.setTimeout(() => setNow(Date.now()), 61_000);
    return () => window.clearTimeout(id);
  }, [state, savedAt]);

  const line = saveLine({ state, cause, savedAt, now, keptOnDevice });
  return (
    <p className="save-status" data-state={state} data-tone={line.tone} role="status" aria-live="polite">
      <span>{line.text}</span>
      {line.retry && onRetry ? (
        <button type="button" className="save-retry" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </p>
  );
}
