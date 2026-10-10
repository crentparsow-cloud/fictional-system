/**
 * The one nudge the ICO recommends (14.5): after a long stretch in one
 * session, a single line suggesting a break. Shown once per session, with no
 * sound and no counter, and the reader can carry on.
 */
export const BREAK_AFTER_MINUTES = 45;

/** Minutes of active time (screen visible) since the session began. */
export function shouldSuggestBreak(activeMs: number, alreadyShown: boolean, afterMinutes = BREAK_AFTER_MINUTES): boolean {
  return !alreadyShown && activeMs >= afterMinutes * 60_000;
}

/** Adds the time since the last tick to the session, ignoring a tick longer than maxGapMs (a sleeping laptop is not reading time). */
export function addActive(activeMs: number, lastTickMs: number, nowMs: number, visible: boolean, maxGapMs = 60_000): number {
  if (!visible) return activeMs;
  const gap = nowMs - lastTickMs;
  return gap > 0 && gap <= maxGapMs ? activeMs + gap : activeMs;
}
