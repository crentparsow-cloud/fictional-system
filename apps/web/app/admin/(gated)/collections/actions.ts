"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminAbilities } from "@/lib/admin/permissions";
import { parseCollectionForm, parseShelfForm } from "@/lib/admin/collections";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Collections and shelf pages (build list 2.3, 2.2). Owners and editors only.
 * The writes go through public.save_collection, public.delete_collection and
 * public.set_shelf_editorial (0043), which check the role again, validate the
 * title codes and write the audit row.
 */
const HOME = "/admin/collections";

function done(notice: string): never {
  revalidatePath(HOME);
  revalidatePath("/explore");
  redirect(`${HOME}?notice=${notice}`);
}

export async function saveCollection(formData: FormData): Promise<void> {
  const staff = await getStaffSession(HOME);
  if (!adminAbilities(staff.roles).curateCatalogue) redirect(`${HOME}?notice=denied`);
  const supabase = await createUserClient();
  const { data: genres } = await supabase.from("genres").select("id");
  const input = parseCollectionForm(formData, ((genres ?? []) as { id: string }[]).map((g) => g.id));
  if (!input) redirect(`${HOME}?notice=collection_invalid`);

  const { error } = await supabase.rpc("save_collection", {
    p_id: input.id,
    p_slug: input.slug,
    p_name: input.name,
    p_line: input.line,
    p_cover_genre: input.coverGenre,
    p_cover_pattern: input.coverPattern,
    p_status: input.status,
    p_sort: input.sort,
    p_codes: input.codes,
  });
  if (error) {
    console.error("admin_collection_save_failed", error.code ?? "");
    redirect(`${HOME}?notice=${error.code === "insufficient_privilege" ? "denied" : error.code?.startsWith("AKE") || error.code === "23505" ? "collection_invalid" : "failed"}`);
  }
  revalidatePath(`/collections/${input.slug}`);
  done("collection_saved");
}

export async function deleteCollection(formData: FormData): Promise<void> {
  const staff = await getStaffSession(HOME);
  if (!adminAbilities(staff.roles).curateCatalogue) redirect(`${HOME}?notice=denied`);
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) redirect(`${HOME}?notice=invalid`);
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("delete_collection", { p_id: id });
  if (error) {
    console.error("admin_collection_delete_failed", error.code ?? "");
    redirect(`${HOME}?notice=${error.code === "insufficient_privilege" ? "denied" : "failed"}`);
  }
  done("collection_deleted");
}

export async function saveShelfPage(formData: FormData): Promise<void> {
  const staff = await getStaffSession(HOME);
  if (!adminAbilities(staff.roles).curateCatalogue) redirect(`${HOME}?notice=denied`);
  const input = parseShelfForm(formData);
  if (!input) redirect(`${HOME}?notice=shelf_invalid`);
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("set_shelf_editorial", { p_shelf: input.shelfId, p_line: input.line, p_featured_code: input.featuredCode });
  if (error) {
    console.error("admin_shelf_save_failed", error.code ?? "");
    redirect(`${HOME}?notice=${error.code === "insufficient_privilege" ? "denied" : error.code?.startsWith("AKE") ? "shelf_invalid" : "failed"}`);
  }
  revalidatePath(`/shelves/${input.shelfId}`);
  done("shelf_saved");
}
