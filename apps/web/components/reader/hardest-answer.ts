import type { WorkbookV3 } from "@akana/schema";
import { fieldKey } from "@/lib/answer-fields";

/**
 * The hardest answer card (F-022): after a reader saves an answer in a field
 * the content marks as sensitive, a quiet card offers Help now. It shows at
 * most once a week per enrolment on this device, and it never tells or
 * alerts anyone. Nothing about the answer leaves the reader's session.
 *
 * Content marker: the optional `sensitive: true` on a schema v3 field
 * (added 7 Oct 2026). Keys are the stored answer paths from fieldKey(), for
 * the exercise itself and for its repeat scope ("<exercise>~r"), so a save in
 * either matches. Fields without the marker are never sensitive.
 */
export function sensitiveFieldKeys(doc: Pick<WorkbookV3, "exercises">): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const exercise of doc.exercises ?? []) {
    for (const field of exercise.fields ?? []) {
      if (field.sensitive !== true) continue;
      keys.add(fieldKey(exercise.id, field.id));
      keys.add(fieldKey(`${exercise.id}~r`, field.id));
    }
  }
  return keys;
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
