"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { addActive, BREAK_AFTER_MINUTES, shouldSuggestBreak } from "@/lib/today/pause";

/**
 * Pause and save (14.5), and the one break line.
 *
 * Pause keeps the exact place, down to the field, and flushes anything still
 * to be saved. Answers are saved as the reader types anyway; Pause says so
 * and gives a calm way out to Today.
 *
 * After 45 minutes of active time in one session, one line suggests a break
 * (the nudge the ICO Children's Code recommends). It shows once, makes no
 * sound, has no counter and no timer on screen, and the reader can carry on.
 * Time is counted only while the page is visible.
 */
export function PauseBar({
  onPause,
  disabled,
  breakMinutes = BREAK_AFTER_MINUTES,
}: {
  /** Saves the place with paused set. Returns false when it could not be kept. */
  onPause: () => Promise<boolean>;
  disabled?: boolean;
  breakMinutes?: number;
}) {
  const [state, setState] = useState<"idle" | "saved" | "failed">("idle");
  const [breakShown, setBreakShown] = useState(false);
  const [breakDismissed, setBreakDismissed] = useState(false);
  const active = useRef(0);
  const last = useRef<number>(0);
  const shown = useRef(false);

  useEffect(() => {
    last.current = Date.now();
    const tick = () => {
      const now = Date.now();
      active.current = addActive(active.current, last.current, now, document.visibilityState === "visible");
      last.current = now;
      if (shouldSuggestBreak(active.current, shown.current, breakMinutes)) {
        shown.current = true;
        setBreakShown(true);
      }
    };
    const id = window.setInterval(tick, 5000);
    return () => window.clearInterval(id);
  }, [breakMinutes]);

  if (state === "saved") {
    return (
      <div className="card pause-card" role="status">
        <p>
          <b>Paused.</b> Your place is saved, down to the field you were in. Your answers are saved as you type.
        </p>
        <p>
          <Link className="btn" href="/today">
            Back to Today
          </Link>{" "}
          <button type="button" className="btn secondary" onClick={() => setState("idle")}>
            Carry on
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="pause-bar">
      {breakShown && !breakDismissed ? (
        <p className="break-line" role="status">
          You have been working for a while. A short break can help, and your place is saved.{" "}
          <button type="button" className="linklike" onClick={() => setBreakDismissed(true)}>
            Carry on
          </button>
        </p>
      ) : null}
      <button type="button" className="btn secondary" disabled={disabled} onClick={async () => setState((await onPause()) ? "saved" : "failed")}>
        Pause here
      </button>
      {state === "failed" ? <span className="muted small"> Your answers are saved, but the place could not be kept just now.</span> : null}
    </div>
  );
}
