/**
 * Send an exercise to someone (12.3). What travels is the prompt: the
 * exercise's title, why it helps in one line, how long it takes and the
 * questions it asks. Never an answer, never the worked example, never the
 * reader's name. Only exercises in the free units of a title at safety tier
 * none can be sent, which are the units anyone can already read, so a link
 * gives the friend nothing they could not open themselves.
 */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

export interface ExercisePrompt {
  id: string;
  title: string;
  purpose: string;
  minutes: number;
  questions: string[];
}

export const EXERCISE_ID = /^[a-z0-9][a-z0-9_]{0,60}$/;
export const WORKBOOK_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The sendable exercises in a unit section body (exercises already resolved in the body). */
export function promptsFromUnitBody(body: unknown): ExercisePrompt[] {
  if (!isRecord(body) || !Array.isArray(body.exercises)) return [];
  const out: ExercisePrompt[] = [];
  for (const e of body.exercises) {
    if (!isRecord(e) || typeof e.id !== "string" || !EXERCISE_ID.test(e.id)) continue;
    const title = str(e.title).trim();
    if (!title) continue;
    const questions = (Array.isArray(e.fields) ? e.fields : [])
      .map((f) => (isRecord(f) ? str(f.label).trim() : ""))
      .filter(Boolean)
      .slice(0, 8);
    out.push({
      id: e.id,
      title,
      purpose: str(e.purpose).trim(),
      minutes: typeof e.minutes === "number" && e.minutes > 0 ? Math.min(60, Math.round(e.minutes)) : 10,
      questions,
    });
  }
  return out;
}

/** Unit numbers anyone can read: 1 up to free_units (default 1, at most 4). */
export function freeUnitNumbers(freeUnits: unknown): number[] {
  const n = typeof freeUnits === "number" && Number.isFinite(freeUnits) ? Math.min(4, Math.max(1, Math.floor(freeUnits))) : 1;
  return Array.from({ length: n }, (_, i) => i + 1);
}

export function exercisePath(slug: string, exerciseId: string): string | null {
  return WORKBOOK_SLUG.test(slug) && EXERCISE_ID.test(exerciseId) ? `/ex/${slug}/${exerciseId}` : null;
}
