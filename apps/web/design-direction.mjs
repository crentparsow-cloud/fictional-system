// The build-time design switch (plan 1.1). Plain ESM so next.config.ts can
// import it without a build, like csp.mjs. lib/design/design.test.ts checks
// the list matches lib/design/directions.ts.
//
//   NEXT_PUBLIC_DESIGN_DIRECTION = paper-and-ink | bright-editorial | quiet-confidence
//
// Blank or unknown values fall back to paper-and-ink. Next.js inlines the
// variable at build time, so a deploy carries exactly one direction's CSS.

export const DIRECTION_IDS = ["paper-and-ink", "bright-editorial", "quiet-confidence"];
export const DEFAULT_DIRECTION = "paper-and-ink";

/**
 * @param {string | undefined | null} value
 * @returns {string}
 */
export function resolveDirection(value) {
  const v = (value ?? "").trim();
  return DIRECTION_IDS.includes(v) ? v : DEFAULT_DIRECTION;
}
