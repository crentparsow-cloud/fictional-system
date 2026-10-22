import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** After a nudge, prompt the friend's page to look again over Realtime Broadcast (no payload). Best effort. */
export async function announceFinishForPair(pairId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("programme_pairs").select("channel_key").eq("id", pairId).eq("status", "active").maybeSingle();
    const key = (data as { channel_key?: string } | null)?.channel_key;
    if (!key) return;
    const channel = admin.channel(`pair-${key}`);
    try {
      await Promise.race([channel.httpSend("finished", {}), new Promise((resolve) => setTimeout(resolve, 3000))]);
    } finally {
      await admin.removeChannel(channel).catch(() => undefined);
    }
  } catch {
    console.error("pair_announce_failed");
  }
}
