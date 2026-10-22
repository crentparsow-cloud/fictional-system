import "server-only";
import { passkeyPromptDue } from "@/lib/mfa/passkey-prompt";
import { passkeyEnabled } from "@/lib/mfa/role-mfa-server";
import { flagEnabled } from "@/lib/platform/flags-server";
import { createUserClient } from "@/lib/supabase/server";

/** Should Today show the passkey prompt to this reader? Any read that fails means no. */
export async function shouldShowPasskeyPrompt(userId: string): Promise<boolean> {
  try {
    const [readerFlag, open] = await Promise.all([flagEnabled("reader_passkeys"), passkeyEnabled()]);
    if (!readerFlag || !open) return false;
    const supabase = await createUserClient();
    const [{ data: factors, error }, { data: dismissed }] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.from("reader_prompts").select("prompt").eq("user_id", userId).eq("prompt", "passkey").maybeSingle(),
    ]);
    if (error || !factors) return false;
    return passkeyPromptDue({
      readerFlag,
      passkeysOpen: open,
      verifiedFactors: factors.all.filter((f) => f.status === "verified").length,
      dismissed: Boolean(dismissed),
    });
  } catch {
    return false;
  }
}
