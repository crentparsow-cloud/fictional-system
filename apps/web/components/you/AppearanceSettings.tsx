"use client";

import { useId, useState, useSyncExternalStore } from "react";
import {
  APPEARANCE_EVENT,
  APPEARANCE_KEY,
  applyAppearance,
  deviceStorage,
  parseAppearance,
  saveAppearance,
  type Appearance,
} from "@/lib/appearance";
import { ReadingSettingsPanel } from "@/components/reader/ReadingSettingsPanel";

const subscribe = (on: () => void) => {
  window.addEventListener(APPEARANCE_EVENT, on);
  window.addEventListener("storage", on);
  return () => {
    window.removeEventListener(APPEARANCE_EVENT, on);
    window.removeEventListener("storage", on);
  };
};
const readRaw = (): string | null => {
  try {
    return deviceStorage()?.getItem(APPEARANCE_KEY) ?? null;
  } catch {
    return null;
  }
};

/**
 * Appearance on You: the reading settings panel (font, text size, page colour,
 * margins, progress; kept on the account), then dim after 9 p.m. and reduced
 * motion, which stay on this device only. Every control is a real button or
 * checkbox, at least 44px, with its state announced.
 */
export function AppearanceSettings() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  // Kept here only when storage is blocked, so the controls still respond.
  const [local, setLocal] = useState<Appearance | null>(null);
  const a = local ?? parseAppearance(raw);
  const [status, setStatus] = useState<"" | "saved" | "blocked">("");
  const id = useId();

  const change = (next: Appearance) => {
    const ok = saveAppearance(deviceStorage(), next);
    setStatus(ok ? "saved" : "blocked");
    if (ok) {
      try {
        window.dispatchEvent(new Event(APPEARANCE_EVENT));
      } catch {
        // the next page load applies it
      }
    } else {
      // Storage blocked: apply to this page anyway.
      setLocal(next);
      applyAppearance(document.documentElement, next, new Date());
    }
  };

  return (
    <section className="you-section" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>Appearance</h2>
      <p className="muted">Dimming and motion are saved on this device only.</p>
      <div className="card appearance">
        <div className="appearance-group">
          <p className="appearance-label">Reading</p>
          <p className="small muted">Font, text size, page colour, margins and progress. Saved to your account, so they follow you.</p>
          <ReadingSettingsPanel variant="inline" />
        </div>

        <div className="appearance-toggle">
          <input type="checkbox" id={`${id}-dim`} checked={a.dimAtNight} onChange={(e) => change({ ...a, dimAtNight: e.target.checked })} aria-describedby={`${id}-dim-d`} />
          <label htmlFor={`${id}-dim`}>
            <b>Dim after 9 p.m.</b>
            <span className="small muted" id={`${id}-dim-d`}>
              Softer colours late in the evening, until 5 a.m.
            </span>
          </label>
        </div>

        <div className="appearance-toggle">
          <input type="checkbox" id={`${id}-motion`} checked={a.reduceMotion} onChange={(e) => change({ ...a, reduceMotion: e.target.checked })} aria-describedby={`${id}-motion-d`} />
          <label htmlFor={`${id}-motion`}>
            <b>Reduce motion</b>
            <span className="small muted" id={`${id}-motion-d`}>
              Screens change without movement. Your phone&apos;s own setting is always followed too.
            </span>
          </label>
        </div>

        <p className="small muted" role="status" aria-live="polite">
          {status === "saved" ? "Saved on this device." : status === "blocked" ? "This browser is not keeping settings, so they apply to this page only." : ""}
        </p>
      </div>
    </section>
  );
}
