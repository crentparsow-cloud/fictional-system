import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { flagOnFor, readFlagRow } from "@/lib/platform/flags-server";
import { pushHeaders, type VapidConfig } from "@/lib/push/vapid";
import type { PushDeps, PushSubscriptionRef } from "@/lib/push/run";
import { reminderDeps } from "@/lib/today/jobs";
import { localParts } from "@/lib/today/reminders";
import type { ReminderTarget } from "@/lib/today/run-reminders";

/**
 * The real effects behind the daily step push (13.19): the service role
 * reads, the push_log claim and the body-less POST to the push service.
 * Endpoints and ids are never logged or returned, only counts.
 */

const SEND_TIMEOUT_MS = 8000;

/** One POST with no body. 201 and its neighbours are delivered; 404 and 410 mean the device is gone. */
export async function sendBodylessPush(config: VapidConfig, endpoint: string, fetcher: typeof fetch = fetch): Promise<"sent" | "gone" | "failed"> {
  const headers = pushHeaders(config, endpoint);
  if (!headers) return "gone";
  try {
    const res = await fetcher(endpoint, { method: "POST", headers, signal: AbortSignal.timeout(SEND_TIMEOUT_MS) });
    if (res.status === 404 || res.status === 410) return "gone";
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

export async function pushDeps(admin: SupabaseClient, config: VapidConfig, origin: string, now: Date, stopAfter: number): Promise<PushDeps> {
  const flagRow = await readFlagRow(admin, "web_push");
  // The reminder job's target and step readers; its mailer is never used here.
  const base = reminderDeps(admin, origin, now, stopAfter, { send: async () => "failed" } as never);
  const subsByUser = new Map<string, PushSubscriptionRef[]>();

  return {
    now,
    stopAfter,
    async targets() {
      const targets = await base.targets();
      const ids = [...new Set(targets.filter((t) => t.safetyTier === "none").map((t) => t.userId))];
      if (ids.length) {
        const { data, error } = await admin.from("push_subscriptions").select("id, user_id, endpoint").in("user_id", ids);
        if (error) throw new Error("push_subscriptions_read_failed");
        for (const r of (data ?? []) as { id: string; user_id: string; endpoint: string }[]) {
          const list = subsByUser.get(r.user_id) ?? [];
          list.push({ id: r.id, endpoint: r.endpoint });
          subsByUser.set(r.user_id, list);
        }
      }
      return targets;
    },
    flagOn: (userId) => flagOnFor(flagRow, "web_push", userId),
    subscriptions: (userId) => subsByUser.get(userId) ?? [],
    async pushedSince(userId, since) {
      const { count } = await admin.from("push_log").select("user_id", { count: "exact", head: true }).eq("user_id", userId).gt("sent_at", since.toISOString());
      return count ?? 0;
    },
    async stepWaiting(target: ReminderTarget, localDate: string) {
      const ctx = await base.stepFor(target);
      if (!ctx) return false;
      const since = new Date(now.getTime() - 36 * 3_600_000).toISOString();
      const { data } = await admin.from("progress_events").select("at").eq("enrolment_id", target.enrolmentId).eq("kind", "step_done").gte("at", since).limit(200);
      const doneToday = ((data ?? []) as { at: string }[]).some((e) => localParts(new Date(e.at), target.timeZone).date === localDate);
      return !doneToday;
    },
    async claim(userId, localDate) {
      const { error } = await admin.from("push_log").insert({ user_id: userId, local_date: localDate });
      if (!error) return true;
      if (error.code === "23505") return false;
      throw new Error("push_log_failed");
    },
    async release(userId, localDate) {
      await admin.from("push_log").delete().eq("user_id", userId).eq("local_date", localDate);
    },
    send: (sub) => sendBodylessPush(config, sub.endpoint),
    async remove(subId) {
      await admin.from("push_subscriptions").delete().eq("id", subId);
    },
    log: (code, detail) => console.error(code, detail ?? ""),
  };
}
