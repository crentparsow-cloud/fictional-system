"use client";

import { useEffect } from "react";
import { caretViewportTop } from "@/lib/reading/caret";
import { centresTyping, dimsParagraphs, isLongAnswer, nearestToCentre, typewriterDelta } from "@/lib/reading/focus";
import type { FocusMode } from "@/lib/reading/settings";

const CURRENT = "data-rd-current";

/**
 * Focus mode (3.11), both halves, only when the reader chose them.
 *
 * Dimming: the paragraph nearest the middle of the screen (or the one the
 * marker is on) keeps full strength and the rest soften. The stylesheet does
 * the dimming from data-focus on the page; this only says which paragraph is
 * current.
 *
 * Typewriter: in a long answer, the line being written is held near the
 * middle of the screen. The page moves by a line at a time with no animation,
 * so reduced motion needs no special case. Nothing about the answer is read
 * or kept.
 */
export function useFocusMode(stage: React.RefObject<HTMLElement | null>, mode: FocusMode, markerEl: HTMLElement | null): void {
  const dim = dimsParagraphs(mode);
  const centre = centresTyping(mode);

  useEffect(() => {
    const root = stage.current;
    if (!dim || !root) return;
    let frame = 0;
    const paint = () => {
      frame = 0;
      const els = [...root.querySelectorAll<HTMLElement>(".ak-player-body [data-ra]")].filter((el) => el.getClientRects().length > 0);
      let current: HTMLElement | null = markerEl && els.includes(markerEl) ? markerEl : null;
      if (!current) {
        const at = nearestToCentre(
          els.map((el) => {
            const r = el.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom };
          }),
          window.innerHeight,
        );
        current = at >= 0 ? els[at]! : null;
      }
      for (const el of els) {
        if (el === current) el.setAttribute(CURRENT, "true");
        else el.removeAttribute(CURRENT);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    paint();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const watch = new MutationObserver(schedule);
    watch.observe(root, { childList: true, subtree: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      watch.disconnect();
      root.querySelectorAll(`[${CURRENT}]`).forEach((el) => el.removeAttribute(CURRENT));
    };
  }, [stage, dim, markerEl]);

  useEffect(() => {
    if (!centre) return;
    const follow = (ev: Event) => {
      const t = ev.target;
      if (!(t instanceof HTMLTextAreaElement) || !stage.current?.contains(t)) return;
      if (!isLongAnswer(t.rows, t.value.length)) return;
      const c = caretViewportTop(t);
      if (!c) return;
      const by = typewriterDelta(c.top, c.lineHeight, window.innerHeight);
      if (by) window.scrollBy({ top: by, behavior: "auto" });
    };
    document.addEventListener("input", follow);
    document.addEventListener("keyup", follow);
    return () => {
      document.removeEventListener("input", follow);
      document.removeEventListener("keyup", follow);
    };
  }, [stage, centre]);
}
