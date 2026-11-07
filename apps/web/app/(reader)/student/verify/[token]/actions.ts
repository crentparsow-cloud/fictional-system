"use server";

import { redirect } from "next/navigation";
import { getReaderSession } from "@/lib/auth";
import { isTokenShaped } from "@/lib/partner";
import { createAdminClient } from "@/lib/supabase/admin";
import { countEvent } from "@/lib/funnel-server";

/**
 * The button on the student link page (14.22). Opening the link changes
 * nothing; this does. The database checks the token against the signed-in
 * reader's own request, so a link opened on the wrong account does nothing.
 * The service role passes the signed-in reader and the raw token; the
 * database hashes it (0068 student_verify_for).
 */
export async function confirmStudentEmail(formData: FormData): Promise<void> {
  const token = String(formData.get("t") ?? "");
  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/student/verify/${token}`)}`);
  if (!isTokenShaped(token)) redirect("/student/verify/invalid?r=invalid");
  let result = "invalid";
  try {
    const { data, error } = await createAdminClient().rpc("student_verify_for", { p_user: session.userId, p_token: token });
    if (!error && typeof data === "string") result = data;
  } catch (err) {
    console.error("student_verify_failed", err instanceof Error ? err.name : "unknown");
  }
  if (result === "verified") await countEvent("student_verified", { userId: session!.userId });
  redirect(`/student/verify/${token}?r=${encodeURIComponent(result)}`);
}
