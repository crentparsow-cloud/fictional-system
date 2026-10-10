/**
 * Pick-up after a gap (4.9). The gap is worked out from the last time the
 * reader did anything in the programme: opened it, finished a step, used a
 * tool. It is only ever compared with a threshold. No count of days is shown,
 * stored or sent anywhere, and the screens never say how long it has been.
 */

export const PICKUP_GAP_DAYS = 14;
const DAY_MS = 86_400_000;

export function lastActivityAt(
  lastOpenedAt: string | null | undefined,
  events: readonly { at: string }[],
): Date | null {
  let best: number | null = null;
  const take = (iso: string | null | undefined) => {
    if (!iso) return;
    const t = Date.parse(iso);
    if (!Number.isNaN(t) && (best === null || t > best)) best = t;
  };
  take(lastOpenedAt);
  for (const e of events) take(e.at);
  return best === null ? null : new Date(best);
}

/** True when the last activity is at least gapDays ago. With no activity at all there is no gap to speak of. */
export function gapDue(last: Date | null, now: Date, gapDays = PICKUP_GAP_DAYS): boolean {
  if (!last) return false;
  return now.getTime() - last.getTime() >= gapDays * DAY_MS;
}

/** Key for a gap on this device, so a skipped prompt stays skipped until the reader next does something. */
export function gapKey(enrolmentId: string, last: Date): string {
  return `akana.pickup.${enrolmentId}.${last.toISOString().slice(0, 10)}`;
}

/** The reflection answer path: one per enrolment per gap, in its own scope. */
export function reflectionField(last: Date): string {
  return `pickup:${last.toISOString().slice(0, 10)}.reflection`;
}
