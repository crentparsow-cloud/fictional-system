import "server-only";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Which of the reader's enrolments they have marked finished (F-017), so
 * Home and Today can show "Keep going" instead of a unit. Read through the
 * reader's own client: RLS on progress_events only returns their rows.
 */
export async function finishedEnrolments(enrolmentIds: readonly string[]): Promise<Set<string>> {
  if (enrolmentIds.length === 0) return new Set();
  const supabase = await createUserClient();
  const { data } = await supabase.from("progress_events").select("enrolment_id").in("enrolment_id", [...enrolmentIds]).eq("kind", "finished");
  return new Set(((data ?? []) as { enrolment_id: string }[]).map((r) => r.enrolment_id));
}
