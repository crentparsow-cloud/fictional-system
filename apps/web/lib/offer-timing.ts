/**
 * When the membership offer may appear (5.5), as pure helpers.
 *
 * Phase A showed the offer after the quiz and one exercise. That is too soon
 * to know whether a reader likes the product. The offer now waits for real
 * use: either a reader has finished a good number of steps on a workbook they
 * began at least a week ago (a first week), or they have started a second
 * workbook sample. The three figures live in public.app_config
 * (offer_after_steps, offer_after_days, offer_after_samples, migration 0054).
 * The counts come from public.my_offer_use, which reads only the reader's
 * own rows and returns two plain numbers.
 */

export interface OfferTiming {
  afterSteps: number;
  afterDays: number;
  afterSamples: number;
}

export const DEFAULT_OFFER_TIMING: OfferTiming = { afterSteps: 5, afterDays: 7, afterSamples: 2 };

export interface OfferUse {
  /** How many different workbooks the reader has begun. */
  samples: number;
  /** The most finished steps on any one workbook begun at least afterDays ago. */
  stepsAged: number;
}

function whole(rows: readonly { key: string; value: unknown }[], key: string, fallback: number, min: number, max: number): number {
  const n = Number(rows.find((r) => r.key === key)?.value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

export function offerTimingFrom(rows: readonly { key: string; value: unknown }[] | null | undefined): OfferTiming {
  const r = rows ?? [];
  return {
    afterSteps: whole(r, "offer_after_steps", DEFAULT_OFFER_TIMING.afterSteps, 1, 1000),
    afterDays: whole(r, "offer_after_days", DEFAULT_OFFER_TIMING.afterDays, 0, 365),
    afterSamples: whole(r, "offer_after_samples", DEFAULT_OFFER_TIMING.afterSamples, 1, 50),
  };
}

/** Real use: a first week with enough steps done, or a second sample. */
export function usedEnough(use: OfferUse | null | undefined, timing: OfferTiming): boolean {
  if (!use) return false;
  const samples = Number.isFinite(use.samples) ? use.samples : 0;
  const steps = Number.isFinite(use.stepsAged) ? use.stepsAged : 0;
  return samples >= timing.afterSamples || steps >= timing.afterSteps;
}

/** The one row my_offer_use returns, in either shape the client gives back. */
export function offerUseFrom(data: unknown): OfferUse | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const o = row as { samples?: unknown; steps_aged?: unknown };
  const samples = Number(o.samples);
  const stepsAged = Number(o.steps_aged);
  return Number.isFinite(samples) && Number.isFinite(stepsAged) ? { samples, stepsAged } : null;
}
