/**
 * Motion values the scripts need. The CSS tokens in app/motion.css are the
 * source; lib/design/design.test.ts checks these match. The toast text is two
 * words by rule (plan 1.6).
 */
export const MOTION_MS = {
  quick: 150,
  base: 200,
  slow: 300,
  page: 260,
  toast: 2200,
  confetti: 1300,
  reveal: 900,
} as const;

/** How long a burst stays mounted: the fall, the longest stagger and a little spare. */
export const CONFETTI_MOUNT_MS = MOTION_MS.confetti + 300;

export const SAVE_TOAST_WORDS = { saved: "Answer saved", failed: "Not saved" } as const;

/** True when the system or the reader's own setting asks for no movement. */
export function motionReduced(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduce";
  } catch {
    return true;
  }
}
