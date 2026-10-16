"use client";

import { useEffect, useRef, useState } from "react";
import { SAVE_TOAST_WORDS, toastForTransition } from "@/lib/motion";

/**
 * The save toast (plan 1.6): two words, one fixed spot above the tabs, polite
 * announcement, no modal. Render it when a save finishes; it fades by itself.
 * The live region stays mounted so screen readers pick up the change.
 * `inline` draws it in the page flow without the fade, for /dev/kit.
 */
export function SaveToast({ state, inline = false }: { state: "idle" | "saved" | "failed"; inline?: boolean }) {
  const words = state === "saved" ? SAVE_TOAST_WORDS.saved : state === "failed" ? SAVE_TOAST_WORDS.failed : "";
  return (
    <div className="save-toast" data-inline={inline ? "true" : undefined} role="status" aria-live="polite">
      {words ? <span key={state}>{words}</span> : null}
    </div>
  );
}

/**
 * The toast wired to the reader's autosave state. Keeps the live region
 * mounted and re-keys the words on each save so the fade replays.
 */
export function AutosaveToast({ state }: { state: string }) {
  const prev = useRef(state);
  const [toast, setToast] = useState<{ n: number; kind: "idle" | "saved" | "failed" }>({ n: 0, kind: "idle" });
  useEffect(() => {
    const kind = toastForTransition(prev.current, state);
    prev.current = state;
    if (kind) setToast((t) => ({ n: t.n + 1, kind }));
  }, [state]);
  return <SaveToast key={toast.n} state={toast.kind} />;
}
