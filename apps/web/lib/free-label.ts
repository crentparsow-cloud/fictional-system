/**
 * The free-first-unit label (5.3): "Week 1 is free, no card". Shown on every
 * library card and workbook page where the first unit is free and can be
 * opened. "Free" is allowed here because nothing is paid and no card is
 * asked for. The membership trial is a different thing and never uses the
 * word (lib/membership-trial.ts trialLabel).
 *
 * The unit word follows the workbook ("Day 1", "Module 1"). When the listing
 * does not say, it is "Unit 1".
 */

export type FreeUnitKind = "week" | "day" | "module" | "chapter";

const WORDS: Record<FreeUnitKind, string> = { week: "Week", day: "Day", module: "Module", chapter: "Chapter" };

export function isFreeUnitKind(v: unknown): v is FreeUnitKind {
  return v === "week" || v === "day" || v === "module" || v === "chapter";
}

/**
 * The label, or null when there is nothing free to say it about: no
 * published first unit, or a free count below one. `freeUnits` defaults to 1,
 * which is what every title ships with (policy 7.9).
 */
export function firstUnitFreeLabel(input: { hasVersion: boolean; unit?: FreeUnitKind | null; freeUnits?: number | null }): string | null {
  if (!input.hasVersion) return null;
  const n = typeof input.freeUnits === "number" && Number.isFinite(input.freeUnits) ? Math.floor(input.freeUnits) : 1;
  if (n < 1) return null;
  const word = input.unit ? WORDS[input.unit] : "Unit";
  if (n === 1) return `${word} 1 is free, no card`;
  if (n === 2) return `${word}s 1 and 2 are free, no card`;
  return `${word}s 1 to ${n} are free, no card`;
}
