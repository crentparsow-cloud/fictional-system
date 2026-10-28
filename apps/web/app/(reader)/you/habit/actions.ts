"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createUserClient } from "@/lib/supabase/server";
import { companionValue, parseHabitForm } from "@/lib/habit/settings";
import { countEvent } from "@/lib/funnel-server";

/**
 * Habit settings (4.4, 4.6, 11.2, 12.4). Each action runs as the signed-in
 * reader through the user client, so row level security decides whose row it
 * is. The database refuses to switch the streak on before it is offered
 * (error AKH01) and refuses a goal above the ceiling (AKH02). Nothing here
 * can reach a mental health title's steps: the streak data comes from
 * public.habit_step_days, which only reads tier 'none' titles.
 */

const back = (code: string): never => redirect(`/you/habit?notice=${code}`);

async function signedIn() {
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/sign-in?next=/you/habit");
  return { supabase, userId: data.user!.id };
}

export async function saveHabit(formData: FormData): Promise<void> {
  const form = parseHabitForm(formData);
  if (!form) back("invalid");
  const f = form!;
  const { supabase, userId } = await signedIn();
  const { data: before } = await supabase.from("habit_settings").select("daily_run_on").eq("user_id", userId).maybeSingle();
  const { error } = await supabase.from("habit_settings").upsert(
    {
      user_id: userId,
      daily_run_on: f.runOn,
      daily_goal: f.goal,
      companion_on: companionValue(f.companion),
      usual_time_on: f.usualTime,
    },
    { onConflict: "user_id" },
  );
  if (error?.code === "AKH01") back("run-early");
  if (error) back("failed");
  const wasOn = (before as { daily_run_on?: boolean } | null)?.daily_run_on === true;
  if (f.runOn !== wasOn) await countEvent(f.runOn ? "streak_turned_on" : "streak_turned_off", { userId });
  revalidatePath("/you/habit");
  revalidatePath("/today");
  back(f.runOn ? "run-on" : "saved");
}

/** The offer on Today: "Turn it on" starts the streak at a goal of one step. */
export async function acceptRunOffer(): Promise<void> {
  const { supabase, userId } = await signedIn();
  const { error } = await supabase.from("habit_settings").upsert({ user_id: userId, daily_run_on: true, daily_goal: 1 }, { onConflict: "user_id" });
  revalidatePath("/today");
  revalidatePath("/you/habit");
  if (error?.code === "AKH01") redirect("/today");
  if (error) redirect("/today");
  await countEvent("streak_turned_on", { userId });
  redirect("/you/habit?notice=run-on");
}

/** "Not now": the offer stays quiet. The reader can still turn it on from the habit page. */
export async function declineRunOffer(): Promise<void> {
  const { supabase, userId } = await signedIn();
  await supabase.from("habit_settings").upsert({ user_id: userId, offer_declined_at: new Date().toISOString() }, { onConflict: "user_id" });
  revalidatePath("/today");
  redirect("/today");
}

/** Marks every new milestone as seen, so the note on Today goes quiet. */
export async function markMarksSeen(): Promise<void> {
  const { supabase, userId } = await signedIn();
  await supabase.from("milestone_marks").update({ seen_at: new Date().toISOString() }).eq("user_id", userId).is("seen_at", null);
  revalidatePath("/today");
  revalidatePath("/you/habit");
}
