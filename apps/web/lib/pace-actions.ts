"use server";

import { revalidatePath } from "next/cache";
import { paceChange } from "@/lib/pace";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Saves the reader's pace for one workbook (0069), from the start screen and
 * the reading screen. It runs as the signed-in reader, so row level security
 * keeps it to their own enrolment; the database refuses an unknown pace.
 * Returns false when it did not save. Quiet on failure: the default pace
 * still applies.
 */
export async function setPace(enrolmentId: string, pace: string): Promise<boolean> {
  const change = paceChange(enrolmentId, pace);
  if (!change) return false;
  try {
    const supabase = await createUserClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return false;
    const { data, error } = await supabase.from("enrolments").update({ pace: change.pace }).eq("id", change.enrolmentId).eq("user_id", auth.user.id).select("id");
    if (error || !data || data.length !== 1) return false;
    revalidatePath("/today");
    revalidatePath("/you/habit");
    return true;
  } catch {
    return false;
  }
}
