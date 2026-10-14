"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { saveReadingSettings } from "@/lib/reading/settings-actions";
import { announceReading, applyToPage, currentReading, saveDeviceReading } from "@/lib/reading/settings-client";
import {
  COLOURS,
  COLOUR_LABELS,
  DEFAULT_READING,
  FONTS,
  FONT_LABELS,
  MARGINS,
  MARGIN_LABELS,
  PROGRESS,
  PROGRESS_LABELS,
  READING_EVENT,
  SIZE_STEPS,
  sameSettings,
  type ReadingSettings,
} from "@/lib/reading/settings";

type Where = "" | "saving" | "account" | "device";

const WHERE_TEXT: Record<Where, string> = {
  "": "",
  saving: "Saving",
  account: "Saved to your account. It follows you to your other devices.",
  device: "Kept on this device. We could not reach your account just now.",
};

/**
 * The reading settings panel (the Aa button): font, size, page colour,
 * margin width and how progress is shown. Changes apply to the page at once,
 * are kept on the device, and are sent to the account a moment later, so the
 * panel still works with no connection. "popover" opens from the Aa button on
 * the reading screen; "inline" sits open on You.
 */
export function ReadingSettingsPanel({ variant = "popover" }: { variant?: "popover" | "inline" }) {
  const id = useId();
  const [open, setOpen] = useState(variant === "inline");
  const [s, setS] = useState<ReadingSettings>(DEFAULT_READING);
  const [where, setWhere] = useState<Where>("");
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<ReadingSettings>(DEFAULT_READING);

  // The settings in force live in browser storage, so they are read after mount.
  useEffect(() => {
    const read = () => {
      const now = currentReading();
      latest.current = now;
      setS(now);
    };
    read();
    window.addEventListener(READING_EVENT, read);
    return () => window.removeEventListener(READING_EVENT, read);
  }, []);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const commit = useCallback((next: ReadingSettings) => {
    if (sameSettings(next, latest.current)) return;
    latest.current = next;
    setS(next);
    applyToPage(next);
    saveDeviceReading({ settings: next, updatedAt: Date.now() });
    announceReading();
    setWhere("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void saveReadingSettings(next)
        .then((at) => {
          if (at === null) return setWhere("device");
          saveDeviceReading({ settings: next, updatedAt: at });
          setWhere("account");
        })
        .catch(() => setWhere("device"));
    }, 600);
  }, []);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  const panel = (
    <div
      className="rs-panel"
      id={`${id}-panel`}
      role={variant === "popover" ? "dialog" : "group"}
      aria-label="Reading settings"
      onKeyDown={(e) => {
        if (variant === "popover" && e.key === "Escape") {
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="rs-group" role="group" aria-labelledby={`${id}-font`}>
        <p className="rs-label" id={`${id}-font`}>
          Font
        </p>
        <div className="rs-options rs-fonts">
          {FONTS.map((f) => (
            <button key={f} type="button" className={`rs-option rs-font-${f}`} aria-pressed={s.font === f} onClick={() => commit({ ...s, font: f })}>
              <span className="rs-sample" aria-hidden="true">
                Aa
              </span>
              <span>
                <b>{FONT_LABELS[f].name}</b>
                <span className="rs-note">{FONT_LABELS[f].note}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="rs-group" role="group" aria-labelledby={`${id}-size`}>
        <p className="rs-label" id={`${id}-size`}>
          Text size
        </p>
        <div className="rs-size">
          <button type="button" className="rs-step" aria-label="Smaller text" disabled={s.size === 0} onClick={() => commit({ ...s, size: Math.max(0, s.size - 1) as ReadingSettings["size"] })}>
            A
          </button>
          <span className="rs-size-dots" role="img" aria-label={`Size ${s.size + 1} of ${SIZE_STEPS.length}`}>
            {SIZE_STEPS.map((n) => (
              <i key={n} data-on={n <= s.size ? "true" : "false"} />
            ))}
          </span>
          <button
            type="button"
            className="rs-step rs-step-large"
            aria-label="Larger text"
            disabled={s.size === SIZE_STEPS.length - 1}
            onClick={() => commit({ ...s, size: Math.min(SIZE_STEPS.length - 1, s.size + 1) as ReadingSettings["size"] })}
          >
            A
          </button>
        </div>
      </div>

      <Choice id={`${id}-colour`} label="Page colour" values={COLOURS} labels={COLOUR_LABELS} value={s.colour} onChange={(colour) => commit({ ...s, colour })} />
      <Choice id={`${id}-margin`} label="Margins" values={MARGINS} labels={MARGIN_LABELS} value={s.margin} onChange={(margin) => commit({ ...s, margin })} />
      <Choice id={`${id}-progress`} label="Progress" values={PROGRESS} labels={PROGRESS_LABELS} value={s.progress} onChange={(progress) => commit({ ...s, progress })} />

      <div className="rs-foot">
        <p className="rs-where small muted" role="status" aria-live="polite">
          {WHERE_TEXT[where]}
        </p>
        <button type="button" className="rs-reset" onClick={() => commit({ ...DEFAULT_READING })} disabled={sameSettings(s, DEFAULT_READING)}>
          Back to standard
        </button>
        {variant === "popover" ? (
          <button type="button" className="rs-close" onClick={close}>
            Close
          </button>
        ) : null}
      </div>
    </div>
  );

  if (variant === "inline") return panel;
  return (
    <div className="rs-wrap">
      <button ref={button} type="button" className="rs-toggle" aria-expanded={open} aria-controls={`${id}-panel`} aria-label="Reading settings" onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">Aa</span>
      </button>
      {open ? panel : null}
    </div>
  );
}

function Choice<T extends string>({ id, label, values, labels, value, onChange }: { id: string; label: string; values: readonly T[]; labels: Record<T, string>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="rs-group" role="group" aria-labelledby={id}>
      <p className="rs-label" id={id}>
        {label}
      </p>
      <div className="rs-options rs-seg">
        {values.map((v) => (
          <button key={v} type="button" className="rs-option" aria-pressed={value === v} onClick={() => onChange(v)}>
            {labels[v]}
          </button>
        ))}
      </div>
    </div>
  );
}
