"use server";

import { createUserClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * "I have read this" on a higher-tier workbook (F-022), kept server side for
 * the enrolment's pinned version (0026). The function checks the enrolment
 * is the signed-in reader's own and the workbook is higher tier. Returns
 * false when it could not be kept; the Player still lets the reader in for
 * this visit, and the note shows again next time.
 */
export async function acknowledgeHigherTier(enrolmentId: string): Promise<boolean> {
  if (typeof enrolmentId !== "string" || !UUID.test(enrolmentId)) return false;
  try {
    const supabase = await createUserClient();
    const { error } = await supabase.rpc("acknowledge_higher_tier", { p_enrolment: enrolmentId });
    if (error) {
      console.error("acknowledge_failed", error.code ?? "");
      return false;
    }
    return true;
  } catch {
    console.error("acknowledge_failed", "exception");
    return false;
  }
}

const EXERCISE = /^[a-z0-9][a-z0-9_:~.-]{0,79}$/;
const PAGES = ["purpose", "steps", "example", "yours", "done"];

export interface PlaceInput {
  unit: number;
  exerciseId: string | null;
  page: string | null;
  fieldId: string | null;
  mode: "full" | "short" | null;
}

/**
 * Pause and save (14.5): keeps the exact place, ids only. The answers
 * themselves are saved as the reader types, through /api/answers. paused is
 * true when the reader pressed Pause, so the next plain open resumes here.
 * Quiet on failure: the place is a convenience.
 */
export async function saveReadingPlace(enrolmentId: string, place: PlaceInput, paused: boolean): Promise<boolean> {
  if (typeof enrolmentId !== "string" || !UUID.test(enrolmentId)) return false;
  if (!Number.isInteger(place.unit) || place.unit < 1 || place.unit > 999) return false;
  if (place.exerciseId !== null && !EXERCISE.test(place.exerciseId)) return false;
  if (place.fieldId !== null && !EXERCISE.test(place.fieldId)) return false;
  if (place.page !== null && !PAGES.includes(place.page)) return false;
  try {
    const supabase = await createUserClient();
    const { error } = await supabase.from("reading_places").upsert(
      {
        enrolment_id: enrolmentId,
        unit: place.unit,
        exercise_id: place.exerciseId,
        page: place.page,
        field_id: place.fieldId,
        mode: place.mode,
        paused: paused === true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "enrolment_id" },
    );
    return !error;
  } catch {
    return false;
  }
}
