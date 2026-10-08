"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { localDay } from "@akana/engine";

const KEY = "ak:not-today";
const EVENT = "akana:not-today";

const subscribe = (on: () => void) => {
  window.addEventListener(EVENT, on);
  window.addEventListener("storage", on);
  return () => {
    window.removeEventListener(EVENT, on);
    window.removeEventListener("storage", on);
  };
};

function readDay(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function writeDay(value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, value);
  } catch {
    // storage blocked: it lasts for this page only
  }
  try {
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // nothing listening
  }
}

/**
 * "Not today" on Today, as in the old app. Pressing it sets today's steps
 * aside with a kind line, on this device only, until tomorrow. Nothing is
 * sent anywhere and nothing is counted: a day off leaves no mark.
 */
export function NotToday({ children, label, doneLine, showLabel }: { children: ReactNode; label: string; doneLine: string; showLabel: string }) {
  const stored = useSyncExternalStore(subscribe, readDay, () => null);
  // Used when storage is blocked, so the button still works on this page.
  const [local, setLocal] = useState<boolean | null>(null);
  const resting = local ?? stored === localDay(new Date());
  const setResting = (v: boolean) => setLocal(v);

  if (resting) {
    return (
      <div className="card not-today-card">
        <p role="status">{doneLine}</p>
        <button
          type="button"
          className="btn secondary"
          onClick={() => {
            writeDay(null);
            setResting(false);
          }}
        >
          {showLabel}
        </button>
      </div>
    );
  }

  return (
    <>
      {children}
      <p className="not-today">
        <button
          type="button"
          className="not-today-btn"
          onClick={() => {
            writeDay(localDay(new Date()));
            setResting(true);
          }}
        >
          {label}
        </button>
      </p>
    </>
  );
}
