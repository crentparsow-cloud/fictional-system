import type { FocusMode } from "./settings";

/** Focus mode (3.11). Pure helpers; the page code reads the browser. */

export const dimsParagraphs = (m: FocusMode): boolean => m === "dim" || m === "both";
export const centresTyping = (m: FocusMode): boolean => m === "typewriter" || m === "both";

/** The index of the block whose middle is nearest the middle of the screen, or -1 when none is on screen. */
export function nearestToCentre(blocks: ReadonlyArray<{ top: number; bottom: number }>, viewportHeight: number): number {
  const mid = viewportHeight / 2;
  let best = -1;
  let bestGap = Infinity;
  blocks.forEach((b, i) => {
    if (b.bottom < 0 || b.top > viewportHeight) return;
    const gap = Math.abs((b.top + b.bottom) / 2 - mid);
    if (gap < bestGap) {
      best = i;
      bestGap = gap;
    }
  });
  return best;
}

/** Where on the screen the writing line is held, as a share of its height. A little above the middle reads best. */
export const TYPEWRITER_LINE = 0.45;
/** The line may drift this far (px) from its place before the page moves, so it does not jitter. */
export const TYPEWRITER_SLACK = 28;

/**
 * How far to scroll so the line being written sits near the middle. Zero
 * when it is already close, and zero for a short answer: the page only moves
 * when the line has dropped below the middle, never to push it up.
 */
export function typewriterDelta(caretTop: number, lineHeight: number, viewportHeight: number): number {
  const want = viewportHeight * TYPEWRITER_LINE;
  const centre = caretTop + lineHeight / 2;
  const off = centre - want;
  return off > TYPEWRITER_SLACK ? Math.round(off) : 0;
}

/** Only a long answer gets centring: a field with several lines of text in it. */
export function isLongAnswer(textareaRows: number, valueLength: number): boolean {
  return textareaRows >= 4 || valueLength > 240;
}

/** Switch one half of focus mode on or off and give the choice that results. */
export function toggleFocus(now: FocusMode, which: "dim" | "typewriter"): FocusMode {
  const dim = dimsParagraphs(now);
  const type = centresTyping(now);
  const d = which === "dim" ? !dim : dim;
  const t = which === "typewriter" ? !type : type;
  return d && t ? "both" : d ? "dim" : t ? "typewriter" : "off";
}
