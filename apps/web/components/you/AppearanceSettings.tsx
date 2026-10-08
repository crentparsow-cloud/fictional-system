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
  type ReadingFont,
  type TextSize,
} from "@/lib/appearance";

const SIZES: TextSize[] = [0, 1, 2, 3];
const SIZE_NAMES = ["Standard", "Larger", "Large", "Largest"] as const;

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
 * Appearance on You: text size, reading font, dim after 9 p.m. and reduced
 * motion. Saved on this device only. Every control is a real button or
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
      <p className="muted">Saved on this device only.</p>
      <div className="card appearance">
        <div className="appearance-group" role="group" aria-labelledby={`${id}-size`}>
          <p className="appearance-label" id={`${id}-size`}>
            Text size
          </p>
          <div className="appearance-sizes">
            {SIZES.map((n) => (
              <button
                key={n}
                type="button"
                className={`appearance-size appearance-size-${n}`}
                aria-pressed={a.textSize === n}
                aria-label={`Text size: ${SIZE_NAMES[n]}`}
                onClick={() => change({ ...a, textSize: n })}
              >
                A
              </button>
            ))}
          </div>
        </div>

        <div className="appearance-group" role="group" aria-labelledby={`${id}-font`}>
          <p className="appearance-label" id={`${id}-font`}>
            Reading font
          </p>
          <div className="appearance-seg">
            {(["atkinson", "lexend"] as ReadingFont[]).map((f) => (
              <button key={f} type="button" className={`appearance-font-${f}`} aria-pressed={a.font === f} onClick={() => change({ ...a, font: f })}>
                {f === "atkinson" ? "Atkinson" : "Lexend"}
              </button>
            ))}
          </div>
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
