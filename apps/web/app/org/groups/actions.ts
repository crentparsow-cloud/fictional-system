"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { withOrgParam } from "@/lib/org-pilot-server";
import { requireOrgConsole } from "@/lib/org-pilot-server";
import { groupErrorNotice, isUuidLike, nextStatuses, parseGroupBasics, parseScheduleForm, withNotice, type GroupNotice } from "@/lib/org-groups";
import { groupUnits, requireGroupLeader } from "@/lib/org-groups-server";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Group actions for the organisation's owner (F-210, F-211) and for group
 * leaders (F-211). Every write goes through a 0028 function, which checks
 * the role again and writes the audit row. Nothing here reads or writes a
 * member's name, address, answers or check-ins.
 */

function to(path: string, notice: GroupNotice): never {
  redirect(withNotice(path, notice));
}

/** The group must belong to the organisation being shown; RLS checks again. */
async function groupOf(orgId: string, groupId: string): Promise<{ id: string; licence_id: string; status: string } | null> {
  if (!isUuidLike(groupId)) return null;
  const supabase = await createUserClient();
  const { data } = await supabase.from("org_groups").select("id, licence_id, status").eq("id", groupId).eq("org_id", orgId).maybeSingle();
  return (data as { id: string; licence_id: string; status: string } | null) ?? null;
}

export async function createGroup(formData: FormData): Promise<void> {
  const ctx = await requireOrgConsole("/org/groups", String(formData.get("org") ?? ""));
  const list = withOrgParam("/org/groups", ctx.org.id, ctx.multi);
  const licence = String(formData.get("licence") ?? "");
  const workbook = String(formData.get("workbook") ?? "");
  const basics = parseGroupBasics((k) => formData.get(k));
  if (!basics.ok) to(list, basics.field === "name_warning" ? "name_warning" : "invalid");
  if (!isUuidLike(licence) || !isUuidLike(workbook)) to(list, "invalid");
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("org_group_create", {
    p_licence: licence,
    p_name: basics.value.name,
    p_workbook: workbook,
    p_starts_on: basics.value.starts_on,
    p_meeting_day: basics.value.meeting_day,
    p_meeting_time: basics.value.meeting_time,
  });
  if (error || typeof data !== "string") {
    console.error("org_group_create_failed", error?.code ?? "");
    to(list, groupErrorNotice(error?.code));
  }
  revalidatePath("/org/groups");
  to(withOrgParam(`/org/groups/${data}`, ctx.org.id, ctx.multi), "created");
}

export async function updateGroup(formData: FormData): Promise<void> {
  const ctx = await requireOrgConsole("/org/groups", String(formData.get("org") ?? ""));
  const id = String(formData.get("group") ?? "");
  const g = await groupOf(ctx.org.id, id);
  if (!g) to(withOrgParam("/org/groups", ctx.org.id, ctx.multi), "invalid");
  const page = withOrgParam(`/org/groups/${g.id}`, ctx.org.id, ctx.multi);
  const basics = parseGroupBasics((k) => formData.get(k));
  if (!basics.ok) to(page, basics.field === "name_warning" ? "name_warning" : "invalid");
  const wanted = String(formData.get("status") ?? g.status);
  const status = wanted === g.status || nextStatuses(g.status).includes(wanted as never) ? wanted : null;
  if (!status) to(page, "invalid");
  if (status === "archived" && formData.get("confirm_archive") !== "yes") to(page, "invalid");
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("org_group_update", {
    p_group: g.id,
    p_name: basics.value.name,
    p_starts_on: basics.value.starts_on,
    p_meeting_day: basics.value.meeting_day,
    p_meeting_time: basics.value.meeting_time,
    p_status: status,
  });
  if (error) {
    console.error("org_group_update_failed", error.code ?? "");
    to(page, groupErrorNotice(error.code));
  }
  revalidatePath(`/org/groups/${g.id}`);
  to(page, "saved");
}

export async function appointLeader(formData: FormData): Promise<void> {
  const ctx = await requireOrgConsole("/org/groups", String(formData.get("org") ?? ""));
  const g = await groupOf(ctx.org.id, String(formData.get("group") ?? ""));
  if (!g) to(withOrgParam("/org/groups", ctx.org.id, ctx.multi), "invalid");
  const page = withOrgParam(`/org/groups/${g.id}`, ctx.org.id, ctx.multi);
  const seat = String(formData.get("seat") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!isUuidLike(seat) || (role !== "leader" && role !== "co_leader")) to(page, "invalid");
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("org_group_appoint", { p_group: g.id, p_seat: seat, p_role: role });
  if (error) {
    console.error("org_group_appoint_failed", error.code ?? "");
    to(page, groupErrorNotice(error.code));
  }
  revalidatePath(`/org/groups/${g.id}`);
  to(page, "appointed");
}

export async function unappointLeader(formData: FormData): Promise<void> {
  const ctx = await requireOrgConsole("/org/groups", String(formData.get("org") ?? ""));
  const g = await groupOf(ctx.org.id, String(formData.get("group") ?? ""));
  if (!g) to(withOrgParam("/org/groups", ctx.org.id, ctx.multi), "invalid");
  const page = withOrgParam(`/org/groups/${g.id}`, ctx.org.id, ctx.multi);
  const role = String(formData.get("role") ?? "");
  if (role !== "leader" && role !== "co_leader") to(page, "invalid");
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("org_group_unappoint", { p_group: g.id, p_role: role });
  if (error) {
    console.error("org_group_unappoint_failed", error.code ?? "");
    to(page, groupErrorNotice(error.code));
  }
  revalidatePath(`/org/groups/${g.id}`);
  to(page, "unappointed");
}

async function saveSchedule(groupId: string, formData: FormData, page: string): Promise<never> {
  const units = await groupUnits(groupId);
  const parsed = parseScheduleForm((k) => formData.get(k), units);
  if (!parsed.ok) to(page, "invalid");
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("org_group_schedule_set", { p_group: groupId, p_units: parsed.value.units, p_dates: parsed.value.dates });
  if (error) {
    console.error("org_group_schedule_failed", error.code ?? "");
    to(page, groupErrorNotice(error.code));
  }
  revalidatePath(page.split("?")[0]!);
  to(page, "schedule_saved");
}

/** The owner sets the schedule from the group page. */
export async function saveScheduleAsOwner(formData: FormData): Promise<void> {
  const ctx = await requireOrgConsole("/org/groups", String(formData.get("org") ?? ""));
  const g = await groupOf(ctx.org.id, String(formData.get("group") ?? ""));
  if (!g) to(withOrgParam("/org/groups", ctx.org.id, ctx.multi), "invalid");
  await saveSchedule(g.id, formData, withOrgParam(`/org/groups/${g.id}`, ctx.org.id, ctx.multi));
}

/** A leader sets the schedule from the leader view. */
export async function saveScheduleAsLeader(formData: FormData): Promise<void> {
  const id = String(formData.get("group") ?? "");
  const { view } = await requireGroupLeader(id, `/org/lead/${id}`);
  await saveSchedule(view.group_id, formData, `/org/lead/${view.group_id}`);
}
