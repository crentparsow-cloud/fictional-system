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
