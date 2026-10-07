"use client";

import { useEffect, useState } from "react";
import type { WorkbookV3 } from "@akana/schema";
import { MemoryAnswerStore, Player } from "@akana/engine";
import { HelpNowButton } from "@/components/HelpNowButton";

type Width = "phone" | "desktop";
type Theme = "system" | "light" | "dark";

/**
 * Preview in the real reader engine (F-038). The same Player the reader
 * uses, with an answer store that lives in memory only: nothing typed here
 * leaves the browser, and a reload clears it. No purchase, no progress
 * events, no locked units. The Preview watermark stays on screen.
 *
 * The controls let the author check the phone and desktop widths, both
 * themes and 200% text. Theme and text size are set on the document root
 * for the life of this page and put back when it closes.
 */
export function PreviewPlayer({ workbook, label }: { workbook: WorkbookV3; label: string }) {
  const [store, setStore] = useState(() => new MemoryAnswerStore());
  const [width, setWidth] = useState<Width>("phone");
  const [theme, setTheme] = useState<Theme>("system");
  const [big, setBig] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    const root = document.documentElement;
    const before = root.dataset.theme;
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;
    return () => {
      if (before === undefined) delete root.dataset.theme;
      else root.dataset.theme = before;
    };
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (big) root.dataset.previewText = "200";
    else delete root.dataset.previewText;
    return () => {
      delete root.dataset.previewText;
    };
  }, [big]);

  const helpSlot = workbook.safety_tier !== "none" ? <HelpNowButton /> : null;

  return (
    <section className="preview" aria-label="Preview">
      <div className="preview-bar" role="note">
        <p className="preview-flag">
          <strong>Preview.</strong> {label} Answers are not saved and nothing here is sold.
        </p>
        <div className="preview-controls">
          <fieldset className="preview-group">
            <legend className="admin-vh">Width</legend>
            <button type="button" className="btn secondary" aria-pressed={width === "phone"} onClick={() => setWidth("phone")}>
              Phone
            </button>
            <button type="button" className="btn secondary" aria-pressed={width === "desktop"} onClick={() => setWidth("desktop")}>
              Desktop
            </button>
          </fieldset>
          <fieldset className="preview-group">
            <legend className="admin-vh">Theme</legend>
            <button type="button" className="btn secondary" aria-pressed={theme === "light"} onClick={() => setTheme(theme === "light" ? "system" : "light")}>
              Light
            </button>
            <button type="button" className="btn secondary" aria-pressed={theme === "dark"} onClick={() => setTheme(theme === "dark" ? "system" : "dark")}>
              Dark
            </button>
          </fieldset>
          <button type="button" className="btn secondary" aria-pressed={big} onClick={() => setBig((b) => !b)}>
            200% text
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              setStore(new MemoryAnswerStore());
              setResetKey((k) => k + 1);
            }}
          >
            Start again
          </button>
        </div>
      </div>
      <div className={`preview-stage is-${width}`} data-watermark="Preview">
        <Player key={resetKey} workbook={workbook} store={store} helpSlot={helpSlot} />
      </div>
    </section>
  );
}
