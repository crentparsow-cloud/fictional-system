"use server";

import { revalidatePath } from "next/cache";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Soft actions on Today: keep or set aside an answer that came back (4.3),
 * and save or unsave a toolkit card for Today (4.1). Neither deletes
 * anything. Both run as the signed-in reader, so row level security checks
 * that the programme and the answer are theirs.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOOL = /^[a-z0-9][a-z0-9_:~.-]{0,79}$/;

export async function markReviewAnswer(enrolmentId: string, answerId: string, state: "kept" | "set_aside"): Promise<boolean> {
  if (!UUID.test(enrolmentId) || !UUID.test(answerId) || (state !== "kept" && state !== "set_aside")) return false;
  try {
    const supabase = await createUserClient();
    const { error } = await supabase
      .from("review_marks")
      .upsert({ answer_id: answerId, enrolment_id: enrolmentId, state, updated_at: new Date().toISOString() }, { onConflict: "answer_id" });
    if (error) return false;
    revalidatePath("/today");
    return true;
  } catch {
    return false;
  }
}

export async function setSavedTool(enrolmentId: string, toolId: string, saved: boolean): Promise<boolean> {
  if (!UUID.test(enrolmentId) || !TOOL.test(toolId)) return false;
  try {
    const supabase = await createUserClient();
    const { error } = saved
      ? await supabase.from("toolkit_saves").upsert({ enrolment_id: enrolmentId, tool_id: toolId }, { onConflict: "enrolment_id,tool_id", ignoreDuplicates: true })
      : await supabase.from("toolkit_saves").delete().eq("enrolment_id", enrolmentId).eq("tool_id", toolId);
    if (error) return false;
    revalidatePath("/today");
    return true;
  } catch {
    return false;
  }
}
