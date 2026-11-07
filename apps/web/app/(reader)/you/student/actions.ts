"use server";

import { redirect } from "next/navigation";
import { getReaderSession } from "@/lib/auth";
import { sendStudentVerify } from "@/lib/conversion-mail";
import { CHECKOUT_BUSY_MESSAGE, hitSelf } from "@/lib/limits";
import { hashToken, mintToken } from "@/lib/partner";
import { emailDomain, isAcademicEmail, studentEnabled, studentSuffixes, studentVerifyHoursFrom } from "@/lib/student";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Ask for the student link (14.22). The reader gives an academic address; we
 * keep a hash of it and its domain, never the address, and email a one-use
 * link to it. The link works for a short time (app_config student_verify_hours).
 * Rate limited with the checkout limit, so a form cannot be used to mail
 * other people's inboxes. Comes back to /you/student with a plain notice.
 *
 * The request is recorded by the service role for the signed-in reader
 * (0068 student_request_for): the academic domain is checked here, and the
 * database hashes the address and the token itself, so nobody can store a
 * hash they chose.
 */
export async function requestStudentVerification(formData: FormData): Promise<void> {
  const session = await getReaderSession();
  if (!session) redirect("/sign-in?next=/you/student");
  const back = (code: string): never => redirect(`/you/student?s=${code}`);
  if (!studentEnabled()) return back("off");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!isAcademicEmail(email, studentSuffixes())) return back("not_academic");
  const domain = emailDomain(email);
  if (!domain) return back("not_academic");

  try {
    const supabase = await createUserClient();
    if (!(await hitSelf(supabase, "checkout_user"))) {
      console.warn("student_verify_rate_limited", CHECKOUT_BUSY_MESSAGE.length);
      return back("busy");
    }
    const token = mintToken();
    const tokenHash = await hashToken(token);
    const { error } = await createAdminClient().rpc("student_request_for", { p_user: session.userId, p_email: email, p_token: token });
    if (error) return back("failed");
    const { data: cfg } = await supabase.from("app_config").select("key, value").eq("key", "student_verify_hours");
    const sent = await sendStudentVerify({
      email,
      userId: session.userId,
      token,
      validHours: studentVerifyHoursFrom((cfg ?? []) as { key: string; value: unknown }[]),
      key: tokenHash.slice(0, 16),
    });
    return back(sent ? "sent" : "failed");
  } catch (err) {
    // redirect() throws; let it through.
    if (err && typeof err === "object" && "digest" in err) throw err;
    console.error("student_verify_request_failed", err instanceof Error ? err.name : "unknown");
    return back("failed");
  }
}
