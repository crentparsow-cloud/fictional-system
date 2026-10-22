"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminAbilities } from "@/lib/admin/permissions";
import { bioIssues, hasStyleErrors, introIssues, lineIssues } from "@/lib/house-style";
import { cleanDay } from "@/lib/seasonal";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Editorial writes (7.6, 7.7, 7.10, 12.5): the weekly slot, Theme intros,
 * seasonal collection dates and author bios. Owners and editors only. The
 * copy is linted here for a kind message and again in the 0062 functions,
 * which check the role and write the audit row. The URL carries fixed codes.
 */
const HOME = "/admin/editorial";

const text = (f: FormData, k: string): string => (typeof f.get(k) === "string" ? String(f.get(k)).trim() : "");
const UUID = /^[0-9a-f-]{36}$/;

async function gate(): Promise<void> {
  const staff = await getStaffSession(HOME);
  if (!adminAbilities(staff.roles).curateCatalogue) redirect(`${HOME}?notice=denied`);
}

function done(notice: string, extra: string[] = []): never {
  revalidatePath(HOME);
  revalidatePath("/");
  revalidatePath("/explore");
  for (const p of extra) revalidatePath(p);
  redirect(`${HOME}?notice=${notice}`);
}

function fail(code: string | undefined, invalid: string): never {
  console.error("admin_editorial_failed", code ?? "");
  redirect(`${HOME}?notice=${code === "insufficient_privilege" ? "denied" : code?.startsWith("AKP") ? invalid : "failed"}`);
}

export async function saveSlot(formData: FormData): Promise<void> {
  await gate();
  const id = text(formData, "id");
  const heading = text(formData, "heading");
  const line = text(formData, "line");
  const starts = cleanDay(text(formData, "starts_on"));
  const ends = cleanDay(text(formData, "ends_on"));
  const status = text(formData, "status") === "live" ? "live" : "draft";
  if ((id && !UUID.test(id)) || !heading || !starts || !ends || hasStyleErrors(lineIssues(`${heading}. ${line}`))) redirect(`${HOME}?notice=slot_invalid`);
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("save_editorial_slot", {
    p_id: id || null,
    p_heading: heading,
    p_line: line,
    p_workbook_code: text(formData, "workbook_code") || null,
    p_theme_id: text(formData, "theme_id") || null,
    p_starts: starts,
    p_ends: ends,
    p_status: status,
  });
  if (error) fail(error.code, "slot_invalid");
  done("slot_saved");
}

export async function deleteSlot(formData: FormData): Promise<void> {
  await gate();
  const id = text(formData, "id");
  if (!UUID.test(id)) redirect(`${HOME}?notice=invalid`);
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("delete_editorial_slot", { p_id: id });
  if (error) fail(error.code, "failed");
  done("slot_deleted");
}

export async function saveThemeIntro(formData: FormData): Promise<void> {
  await gate();
  const theme = text(formData, "theme");
  const intro = text(formData, "intro");
  if (!/^[a-z0-9-]{1,60}$/.test(theme) || hasStyleErrors(introIssues(intro))) redirect(`${HOME}?notice=intro_invalid`);
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("set_theme_intro", { p_theme: theme, p_intro: intro });
  if (error) fail(error.code, "intro_invalid");
  done("intro_saved", [`/themes/${theme}`]);
}

export async function saveCollectionWindow(formData: FormData): Promise<void> {
  await gate();
  const id = text(formData, "id");
  const rawStart = text(formData, "starts_on");
  const rawEnd = text(formData, "ends_on");
  const starts = rawStart ? cleanDay(rawStart) : null;
  const ends = rawEnd ? cleanDay(rawEnd) : null;
  if (!UUID.test(id) || (rawStart && !starts) || (rawEnd && !ends) || (starts && ends && ends < starts)) redirect(`${HOME}?notice=window_invalid`);
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("set_collection_window", { p_id: id, p_starts: starts, p_ends: ends });
  if (error) fail(error.code, "window_invalid");
  done("window_saved", ["/collections"]);
}

export async function saveAuthorBio(formData: FormData): Promise<void> {
  await gate();
  const slug = text(formData, "slug");
  const bio = text(formData, "bio");
  if (!/^[a-z0-9-]{1,80}$/.test(slug) || hasStyleErrors(bioIssues(bio))) redirect(`${HOME}?notice=bio_invalid`);
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("staff_set_author_bio", { p_slug: slug, p_bio: bio });
  if (error) fail(error.code, "bio_invalid");
  done("bio_saved", [`/authors/${slug}`]);
}
