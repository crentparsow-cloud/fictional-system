import type { WorkbookV3 } from "@akana/schema";

/**
 * The hardest answer card (F-022): after a reader saves an answer in a field
 * the content marks as sensitive, a quiet card offers Help now. It shows at
 * most once a week per enrolment on this device, and it never tells or
 * alerts anyone. Nothing about the answer leaves the reader's session.
 *
 * Content marker: none yet. Schema v3 (packages/schema/src/v3.ts) has no
 * field-level sensitive flag, and the legacy app had no such card. The
 * nearest markers are exercise and toolkit `safety_link` (a line linking to
 * Safety and support under the steps) and self-check `safety_item`, and
 * neither says "this field is sensitive". Rather than invent one, the set
 * below is empty, so the card is built and wired but cannot show until the
 * schema gains a marker and this function reads it.
 */
export function sensitiveFieldKeys(doc: Pick<WorkbookV3, "exercises">): ReadonlySet<string> {
  void doc;
  return new Set<string>();
}

export const HARDEST_CARD_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/** Should the card show now? Pure, so the weekly rule is tested. */
export function shouldShowHardestCard(input: {
  field: string;
  sensitive: ReadonlySet<string>;
  /** When the card last showed for this enrolment, in ms, or null. */
  lastShownAt: number | null;
  now: number;
}): boolean {
  if (!input.sensitive.has(input.field)) return false;
  if (input.lastShownAt === null || !Number.isFinite(input.lastShownAt)) return true;
  return input.now - input.lastShownAt >= HARDEST_CARD_INTERVAL_MS;
}

/** Device-local key. A convenience only: losing it means the card may show again sooner. */
export function hardestCardKey(enrolmentId: string): string {
  return `ak:hardest:${enrolmentId}`;
}
