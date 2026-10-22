"use server";

import { redirect } from "next/navigation";
import { getReaderSession } from "@/lib/auth";
import { hashToken, isTokenShaped } from "@/lib/partner";
import { createUserClient } from "@/lib/supabase/server";

/**
 * The button on the student link page (14.22). Opening the link changes
 * nothing; this does. The database checks the token against the signed-in
 * reader's own request, so a link opened on the wrong account does nothing.
 */
export async function confirmStudentEmail(formData: FormData): Promise<void> {
  const token = String(formData.get("t") ?? "");
  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/student/verify/${token}`)}`);
  if (!isTokenShaped(token)) redirect("/student/verify/invalid?r=invalid");
  let result = "invalid";
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase.rpc("student_verify", { p_token_hash: await hashToken(token) });
    if (!error && typeof data === "string") result = data;
  } catch (err) {
    console.error("student_verify_failed", err instanceof Error ? err.name : "unknown");
  }
  redirect(`/student/verify/${token}?r=${encodeURIComponent(result)}`);
}
