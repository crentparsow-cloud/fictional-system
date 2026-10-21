"use server";

import { redirect } from "next/navigation";
import { hashRecoveryCode, normaliseRecoveryCode } from "@/lib/mfa/recovery-codes";
import { READER_SECURITY_PATH } from "@/lib/mfa/reader-mfa";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

/**
 * A reader's recovery code at /verify (13.2). The session is signed in but
 * at aal1: the authenticator is lost. The code is checked by hash through
 * mfa_recovery_code_use (0037), which limits guesses. When it matches, the
 * TOTP factors are removed with the service role (a verified factor cannot
 * be removed at aal1 by the user client) and the remaining codes are
 * cleared, so two-step sign-in is off and the reader can set it up again.
 */

export type RecoveryState = { error: string | null };

export async function redeemRecoveryCode(_prev: RecoveryState, formData: FormData): Promise<RecoveryState> {
  const supabase = await createUserClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/sign-in?next=/verify");

  const code = normaliseRecoveryCode(formData.get("code"));
  // Count a malformed entry as a guess too, so the limit cannot be probed around.
  const { data: ok, error } = await supabase.rpc("mfa_recovery_code_use", { p_hash: code ? hashRecoveryCode(code) : "" });
  if (error) {
    if (error.code === "AKR02") return { error: "Too many tries. Wait an hour, then try again." };
    console.error("reader_recovery_use_failed", error.code ?? "");
    return { error: "The code could not be checked just now. Try again in a moment." };
  }
  if (ok !== true) return { error: "That code did not work. Check it and try again, or use your authenticator app." };

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    console.error("reader_recovery_no_admin_client");
    return { error: "Your code was accepted, but two-step sign-in could not be turned off just now. Contact support." };
  }
  const { data: listed, error: listError } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
  if (listError) {
    console.error("reader_recovery_list_failed", listError.code ?? "");
    return { error: "Your code was accepted, but two-step sign-in could not be turned off just now. Contact support." };
  }
  for (const f of listed?.factors ?? []) {
    if (f.factor_type !== "totp") continue;
    const { error: delError } = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: user.id });
    if (delError) {
      console.error("reader_recovery_delete_failed", delError.code ?? "");
      return { error: "Your code was accepted, but two-step sign-in could not be turned off just now. Contact support." };
    }
  }
  const { error: clearError } = await supabase.rpc("mfa_recovery_codes_clear");
  if (clearError) console.error("reader_recovery_clear_failed", clearError.code ?? "");
  redirect(`${READER_SECURITY_PATH}?notice=recovered`);
}
