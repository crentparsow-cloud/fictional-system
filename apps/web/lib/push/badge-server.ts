import "server-only";
import { localParts } from "@/lib/today/reminders";
import { createUserClient } from "@/lib/supabase/server";

/** Has the signed-in reader finished a step today (their own events, by RLS)? */
export async function finishedStepToday(timeZone: string, now: Date = new Date()): Promise<boolean> {
  try {
    const supabase = await createUserClient();
    const since = new Date(now.getTime() - 36 * 3_600_000).toISOString();
    const { data } = await supabase.from("progress_events").select("at").eq("kind", "step_done").gte("at", since).limit(200);
    const today = localParts(now, timeZone).date;
    return ((data ?? []) as { at: string }[]).some((e) => localParts(new Date(e.at), timeZone).date === today);
  } catch {
    return false;
  }
}
