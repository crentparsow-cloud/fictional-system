"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createUserClient } from "@/lib/supabase/server";
import { parseSettingsForm, remindersReallyOn } from "@/lib/today/settings";

/**
 * Today settings (4.3, 4.7, 4.8, 4.9). Each action runs as the signed-in
 * reader through the user client, so row level security decides whose
 * programme it is. The stop stamp and the calendar hash cannot be written
 * from here: the database refuses, and the link comes from new_calendar_token.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const back = (code: string): never => redirect(`/you?today=${code}#today-settings`);

export async function saveTodaySettings(formData: FormData): Promise<void> {
  const form = parseSettingsForm(formData);
  if (!form) back("invalid");
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/sign-in?next=/you");
  const f = form!;
  const { error } = await supabase.from("today_settings").upsert(
    {
      enrolment_id: f.enrolment,
      user_id: data.user.id,
      reminders_on: remindersReallyOn(f),
      reminder_days: f.days,
      reminder_time: f.time,
      timezone: f.timeZone,
      review_frequency: f.review,
      pickup_on: f.pickup,
    },
    { onConflict: "enrolment_id" },
  );
  if (error) back("failed");
  revalidatePath("/you");
  revalidatePath("/today");
  back(remindersReallyOn(f) || !f.remindersOn ? "saved" : "needs-day");
}

/** Makes a new calendar link and returns it once. The old link stops working. */
export async function createCalendarLink(enrolmentId: string): Promise<{ token: string } | { error: "failed" }> {
  if (typeof enrolmentId !== "string" || !UUID.test(enrolmentId)) return { error: "failed" };
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("new_calendar_token", { p_enrolment: enrolmentId });
  if (error || typeof data !== "string") return { error: "failed" };
  return { token: data };
}

export async function removeCalendarLink(enrolmentId: string): Promise<boolean> {
  if (typeof enrolmentId !== "string" || !UUID.test(enrolmentId)) return false;
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("clear_calendar_token", { p_enrolment: enrolmentId });
  return !error;
}

/** Brings back every answer the reader set aside in one programme. Nothing was ever deleted. */
export async function bringBackSetAside(formData: FormData): Promise<void> {
  const enrolment = String(formData.get("enrolment") ?? "");
  if (!UUID.test(enrolment)) back("invalid");
  const supabase = await createUserClient();
  const { error } = await supabase.from("review_marks").update({ state: "kept", updated_at: new Date().toISOString() }).eq("enrolment_id", enrolment).eq("state", "set_aside");
  if (error) back("failed");
  back("brought-back");
}
