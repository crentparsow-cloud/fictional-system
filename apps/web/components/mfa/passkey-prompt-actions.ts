"use server";

import { revalidatePath } from "next/cache";
import { getReaderSession } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase/server";

/** Dismiss the passkey prompt for good, on the account (13.3). */
export async function dismissPasskeyPrompt(): Promise<void> {
  const session = await getReaderSession();
  if (!session) return;
  const supabase = await createUserClient();
  const { error } = await supabase.from("reader_prompts").upsert({ user_id: session.userId, prompt: "passkey" }, { onConflict: "user_id,prompt", ignoreDuplicates: true });
  if (error) console.error("passkey_prompt_dismiss_failed", error.code ?? "");
  revalidatePath("/today");
}
