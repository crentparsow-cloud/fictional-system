import "server-only";
import { isNudgeCode, type PairView } from "@/lib/friends/pair";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

interface Row {
  pair_id: string;
  workbook_slug: string;
  title: string;
  status: string;
  friend_label: string | null;
  channel_key: string;
  i_am_inviter: boolean;
  friend_finished_today: boolean;
  i_finished_today: boolean;
  nudge_sent_today: boolean;
  nudge_code: string | null;
}

export function toPairView(r: Row): PairView {
  return {
    pairId: r.pair_id,
    slug: r.workbook_slug,
    title: r.title,
    status: r.status === "active" ? "active" : "invited",
    label: r.friend_label ?? "Your friend",
    channelKey: r.channel_key,
    iAmInviter: r.i_am_inviter,
    friendFinishedToday: r.friend_finished_today,
    iFinishedToday: r.i_finished_today,
    nudgeSentToday: r.nudge_sent_today,
    nudgeCode: isNudgeCode(r.nudge_code) ? r.nudge_code : null,
  };
}

/** The signed-in reader's pairings, through public.my_pairs (members only). Empty on any failure. */
export async function loadMyPairs(): Promise<PairView[]> {
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase.rpc("my_pairs");
    if (error) return [];
    return ((data ?? []) as Row[]).map(toPairView);
  } catch {
    return [];
  }
}

/**
 * Tell a reader's friends something happened, over Supabase Realtime
 * Broadcast, with no payload. Called after a finished step. Best effort: if
 * Realtime is off or slow the friend's page catches up by polling.
 */
export async function announceFinish(userId: string, workbookId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("pair_channels_for", { p_user: userId, p_workbook: workbookId });
    if (error) return;
    for (const row of (data ?? []) as { channel_key: string }[]) {
      const channel = admin.channel(`pair-${row.channel_key}`);
      try {
        await Promise.race([channel.httpSend("finished", {}), new Promise((resolve) => setTimeout(resolve, 3000))]);
      } finally {
        await admin.removeChannel(channel).catch(() => undefined);
      }
    }
  } catch {
    console.error("pair_announce_failed");
  }
}
