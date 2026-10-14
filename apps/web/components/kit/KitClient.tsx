"use client";

import { useEffect, useState } from "react";
import { KitSections } from "./KitSections";
import { ReadingSettingsPanel } from "@/components/reader/ReadingSettingsPanel";
import { Confetti } from "@/components/motion/Confetti";
import { SaveToast } from "@/components/motion/SaveToast";
import { ACTIVE_DIRECTION_ID } from "@/lib/design/active";
import { DIRECTIONS, DIRECTION_IDS, type DirectionId } from "@/lib/design/directions";
import { buildThemeCss } from "@/lib/design/tokens";
import "@/app/dev/kit/kit.css";

/**
 * The kit's switcher: the build's own direction is loaded as a file; picking
 * another injects that direction's token file as a style element after it, so
 * the same cascade rules apply and nothing else changes. Choosing a direction
 * for real is NEXT_PUBLIC_DESIGN_DIRECTION (docs/DESIGN_SYSTEM.md).
 */
export function KitClient() {
  const [direction, setDirection] = useState<DirectionId>(ACTIVE_DIRECTION_ID);
  const [burst, setBurst] = useState(0);
  const [toast, setToast] = useState<"idle" | "saved" | "failed">("idle");

  useEffect(() => {
    let el = document.getElementById("kit-direction") as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = "kit-direction";
      document.head.appendChild(el);
    }
    el.textContent = buildThemeCss(direction);
    document.documentElement.dataset.direction = direction;
    return () => {
      el?.remove();
      document.documentElement.dataset.direction = ACTIVE_DIRECTION_ID;
    };
  }, [direction]);

  return (
    <main id="main" className="wrap kit">
      <h1>Component kit</h1>
      <p className="muted">Shared components in every state, light and dark. Developers and staff only.</p>

      <div className="kit-switch" role="group" aria-label="Design direction">
        {DIRECTION_IDS.map((id) => (
          <button key={id} type="button" className="btn secondary" aria-pressed={direction === id} onClick={() => setDirection(id)}>
            {DIRECTIONS[id].label}
            {id === ACTIVE_DIRECTION_ID ? " (this build)" : ""}
          </button>
        ))}
      </div>

      <KitSections direction={direction} />

      <section className="kit-section" aria-labelledby="kit-live">
        <h2 id="kit-live">Live</h2>
        <p className="muted">These respond. With reduced motion on, the confetti does not show.</p>
        <div className="kit-row kit-confetti-live">
          <button type="button" className="btn" onClick={() => setBurst((n) => n + 1)}>Unit end burst</button>
          <button type="button" className="btn secondary" onClick={() => setToast("saved")}>Show saved toast</button>
          <button type="button" className="btn secondary" onClick={() => setToast("failed")}>Show not saved toast</button>
          {burst > 0 ? <Confetti key={burst} /> : null}
        </div>
        <SaveToast key={toast} state={toast} />
        <h3>Reading settings (the Aa panel)</h3>
        <ReadingSettingsPanel variant="inline" />
      </section>
    </main>
  );
}
