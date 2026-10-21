"use server";

import { revalidatePath } from "next/cache";
import { getReaderSession } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Deletes one "Then and now" entry. Row level security lets a reader delete only their own. */
export async function deleteThenNowEntry(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const session = await getReaderSession();
  if (!session || !UUID.test(id)) return;
  const supabase = await createUserClient();
  await supabase.from("then_now_entries").delete().eq("id", id).eq("user_id", session.userId);
  revalidatePath("/you");
}

/** Deletes every "Then and now" entry the reader has. */
export async function deleteAllThenNow(): Promise<void> {
  const session = await getReaderSession();
  if (!session) return;
  const supabase = await createUserClient();
  await supabase.from("then_now_entries").delete().eq("user_id", session.userId);
  revalidatePath("/you");
}
