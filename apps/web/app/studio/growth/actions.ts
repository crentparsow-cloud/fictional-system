"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { addRecommendation, removeRecommendation } from "@/lib/author-growth";
import { isUuid, withOrg } from "@/lib/studio";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Studio growth actions (14.12, 6.4). Each runs as the signed-in member
 * through the 0052 functions, which check the organisation role again.
 * Redirects carry a fixed notice code only.
 */
const PATH = "/studio/growth";

function back(orgId: string, notice: string): never {
  const p = withOrg(PATH, orgId, true);
  redirect(`${p}${p.includes("?") ? "&" : "?"}notice=${notice}`);
}

async function currentList(orgId: string): Promise<string[] | null> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("my_author_recommendations", { p_org: orgId });
  if (error) return null;
  return ((data ?? []) as { direction: string; org_id: string; position: number }[])
    .filter((r) => r.direction === "recommends")
    .sort((a, b) => a.position - b.position)
    .map((r) => r.org_id);
}

async function save(orgId: string, list: string[]): Promise<boolean> {
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("set_author_recommendations", { p_org: orgId, p_to: list });
  if (error) console.error("studio_recommendations_failed", error.code ?? "");
  return !error;
}

export async function recommendAuthor(formData: FormData): Promise<void> {
  const org = String(formData.get("org") ?? "");
  const to = String(formData.get("to") ?? "");
  if (!isUuid(org) || !isUuid(to)) redirect(PATH);
  const current = await currentList(org);
  if (!current) back(org, "rec-failed");
  const next = addRecommendation(current, to);
  if (!next.ok) back(org, next.reason === "full" ? "rec-full" : "rec-already");
  if (!(await save(org, next.list))) back(org, "rec-failed");
  revalidatePath(PATH);
  back(org, "rec-saved");
}

export async function unrecommendAuthor(formData: FormData): Promise<void> {
  const org = String(formData.get("org") ?? "");
  const to = String(formData.get("to") ?? "");
  if (!isUuid(org) || !isUuid(to)) redirect(PATH);
  const current = await currentList(org);
  if (!current) back(org, "rec-failed");
  if (!(await save(org, removeRecommendation(current, to)))) back(org, "rec-failed");
  revalidatePath(PATH);
  back(org, "rec-removed");
}
