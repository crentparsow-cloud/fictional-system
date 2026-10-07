"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminAbilities } from "@/lib/admin/permissions";
import { parseReason } from "@/lib/admin/review";
import { sendAuthorStatus } from "@/lib/author-mail";
import { isUuid } from "@/lib/author-release";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Move a submission on (0013 public.submission_set_status) and email the
 * organisation (F-043): accepted, or changes requested with the reason.
 * Owners and editors only; the function checks again and writes the audit
 * row. A decline carries a reason too, which the author sees in the Studio.
 */
const TARGETS = ["accepted", "changes_requested", "declined"] as const;
type Target = (typeof TARGETS)[number];

export async function setSubmissionStatus(fd: FormData): Promise<void> {
  const id = fd.get("submission");
  if (!isUuid(id)) redirect("/admin/review?notice=invalid");
  const page = `/admin/review/submissions/${id}`;
  const staff = await getStaffSession(page);
  if (!adminAbilities(staff.roles).releaseVersions) redirect(`${page}?notice=denied`);
  const target = fd.get("status") as Target;
  if (!(TARGETS as readonly string[]).includes(target)) redirect(`${page}?notice=invalid`);
  const reason = parseReason(fd.get("reason"), 500);
  if (target !== "accepted" && !reason) redirect(`${page}?notice=reason`);

  const supabase = await createUserClient();
  const { data: sub } = await supabase.from("workbook_submissions").select("workbook_id").eq("id", id).maybeSingle();
  const workbookId = (sub as { workbook_id?: string } | null)?.workbook_id;
  if (!workbookId) redirect(`${page}?notice=invalid`);
  const { error } = await supabase.rpc("submission_set_status", { p_submission: id, p_status: target, p_reason: reason });
  if (error) {
    console.error("admin_submission_status_failed", error.code ?? "");
    redirect(`${page}?notice=${error.code === "AKS08" ? "stale" : error.code === "AKS01" ? "denied" : "failed"}`);
  }

  let mailed = 0;
  if (target === "accepted") mailed = await sendAuthorStatus(workbookId, "submission_accepted", { versionId: id });
  if (target === "changes_requested") mailed = await sendAuthorStatus(workbookId, "changes_requested", { notes: reason ? [reason] : [] });
  revalidatePath(page);
  revalidatePath("/admin/review");
  redirect(`${page}?notice=${target === "declined" ? "status" : mailed > 0 ? "author_mailed" : "author_not_mailed"}`);
}
