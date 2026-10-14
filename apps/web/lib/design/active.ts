import { DEFAULT_DIRECTION, DIRECTIONS, isDirectionId, type Direction, type DirectionId } from "./directions";

/**
 * The direction this build ships (plan 1.1). Read from
 * NEXT_PUBLIC_DESIGN_DIRECTION, which Next.js inlines at build time; blank or
 * unknown means paper-and-ink. app/themes/<id>.css is chosen by the same
 * variable in next.config.ts (design-direction.mjs).
 */
export function directionFromEnv(value: string | undefined | null): DirectionId {
  const v = (value ?? "").trim();
  return isDirectionId(v) ? v : DEFAULT_DIRECTION;
}

export const ACTIVE_DIRECTION_ID: DirectionId = directionFromEnv(process.env.NEXT_PUBLIC_DESIGN_DIRECTION);
export const activeDirection: Direction = DIRECTIONS[ACTIVE_DIRECTION_ID];

/** Fonts to preload for a direction: the sans for the interface and the serif for content, Latin, upright. */
export function preloadFonts(d: Direction): string[] {
  return d.fontFiles.filter((f) => f.includes("-normal")).map((f) => `/fonts/${f}`);
}
