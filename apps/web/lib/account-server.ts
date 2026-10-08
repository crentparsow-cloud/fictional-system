import "server-only";
import { deletionState, isReadOnly, type DeletionRow, type DeletionState } from "@/lib/account";
import { createUserClient } from "@/lib/supabase/server";

type UserClient = Awaited<ReturnType<typeof createUserClient>>;

/**
 * The reader's own deletion state, read under RLS (0007). Filtered by user
 * id as well, because platform owners and support can read every row. If
 * the row cannot be read the account is treated as normal: the database
 * still refuses progress writes while a deletion is pending (0026).
 */
export async function readerDeletion(supabase: UserClient, userId: string, now: Date = new Date()): Promise<{ state: DeletionState; readOnly: boolean }> {
  try {
    const { data, error } = await supabase
      .from("account_deletion_requests")
      .select("requested_at, cancel_before, cancelled_at, completed_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return { state: { kind: "none" }, readOnly: false };
    const state = deletionState(data as DeletionRow | null, now);
    return { state, readOnly: isReadOnly(state) };
  } catch {
    return { state: { kind: "none" }, readOnly: false };
  }
}
