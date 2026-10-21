"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isUuid } from "@/lib/author-release";
import { requireRoleMfa } from "@/lib/mfa/role-mfa-server";
import { parseQuestionForm } from "@/lib/programme-question";
import { roleCan, withOrg } from "@/lib/studio";
import { requireStudio } from "@/lib/studio-server";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Save or clear the one end-of-programme question (build list 8.5) through
 * public.studio_set_programme_question (0057), which checks the role and
 * refuses a title with a safety tier. Changing the wording or the answers
 * removes the answers given so far.
 */
export async function saveProgrammeQuestion(fd: FormData): Promise<void> {
  const workbook = fd.get("workbook");
  if (!isUuid(workbook)) redirect("/studio/workbooks");
  const orgRaw = fd.get("org");
  const org = typeof orgRaw === "string" && isUuid(orgRaw) ? orgRaw : undefined;
  const base = withOrg(`/studio/workbooks/${workbook}/question`, org, Boolean(org));
  const sep = base.includes("?") ? "&" : "?";
  const ctx = await requireStudio(`/studio/workbooks/${workbook}/question`, org);
  await requireRoleMfa(ctx.org.role, base);
  if (!roleCan(ctx.org.role).writeWorkbooks) redirect(`${base}${sep}notice=denied`);

  const parsed = parseQuestionForm(fd.get("question"), fd.getAll("option"));
  if (!parsed.ok) redirect(`${base}${sep}notice=question-invalid`);
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("studio_set_programme_question", {
    p_workbook: workbook,
    p_question: parsed.value?.question ?? "",
    p_options: parsed.value?.options ?? [],
  });
  if (error) {
    console.error("studio_question_failed", error.code ?? "");
    redirect(`${base}${sep}notice=${error.code === "AKZ31" ? "question-invalid" : error.code === "AKZ21" ? "denied" : "failed"}`);
  }
  revalidatePath(`/studio/workbooks/${workbook}/question`);
  redirect(`${base}${sep}notice=${parsed.value ? "question-saved" : "question-cleared"}`);
}
