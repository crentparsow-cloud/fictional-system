import "server-only";
import { notFound, redirect } from "next/navigation";
import { getReaderSession } from "@/lib/auth";
import { isUuidLike } from "@/lib/org-groups";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Server side of groups (F-210 to F-216). Everything runs through the
 * signed-in person's client, so row level security and the 0028 functions
 * decide what comes back. No service role here.
 */

export interface LeaderView {
  group_id: string;
  group_name: string;
  organisation_name: string;
  organisation_kind: string;
  workbook_title: string;
  version_id: string;
  status: string;
  faith: boolean;
  starts_on: string | null;
  meeting_day: number | null;
  meeting_time: string | null;
  members: number;
  current_unit: number | null;
  current_week: number | null;
  my_role: string | null;
  guide_available: boolean;
}

export interface CountRow {
  choice: string;
  n: number | null;
  shown: string;
  threshold: number;
}

export interface ScheduleRow {
  unit_number: number;
  opens_on: string;
}

/**
 * For the leader pages: signed in, and an accepted leader or co-leader of
 * this group. Anyone else sees a 404, so the page does not confirm the
 * group exists.
 */
export async function requireGroupLeader(groupId: string, next: string): Promise<{ userId: string; view: LeaderView }> {
  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  if (!isUuidLike(groupId)) notFound();
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("org_group_leader_view", { p_group: groupId });
  if (error) {
    if (error.code !== "AKG01") console.error("org_leader_view_failed", error.code ?? "");
    notFound();
  }
  const view = ((data ?? []) as LeaderView[])[0];
  if (!view) notFound();
  return { userId: session.userId, view };
}

export async function groupSchedule(groupId: string): Promise<ScheduleRow[]> {
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("org_group_schedule")
    .select("unit_number, opens_on")
    .eq("group_id", groupId)
    .order("opens_on", { ascending: true })
    .order("unit_number", { ascending: true });
  if (error) console.error("org_group_schedule_read_failed", error.code ?? "");
  return (data ?? []) as ScheduleRow[];
}

export async function groupUnits(groupId: string): Promise<number[]> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("org_group_units", { p_group: groupId });
  if (error) console.error("org_group_units_failed", error.code ?? "");
  return Array.isArray(data) ? (data as number[]).filter((n) => Number.isInteger(n)) : [];
}

export async function groupCheckinCounts(groupId: string, unit: number): Promise<CountRow[]> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("org_group_checkin_counts", { p_group: groupId, p_unit: unit });
  if (error) console.error("org_group_counts_failed", error.code ?? "");
  return (data ?? []) as CountRow[];
}
