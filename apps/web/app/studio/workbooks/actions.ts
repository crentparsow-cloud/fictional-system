"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isUuid, parsePriceChoice, parseStudioSignoff, releaseErrorNotice, type ReleaseNotice } from "@/lib/author-release";
import { withOrg } from "@/lib/studio";
import { requireStudio } from "@/lib/studio-server";
import { postComment } from "@/lib/workbook-comments-server";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Studio workbook actions: sign off a version against its content hash
 * (F-039), post on the workbook's comment thread (F-039, 0027) and choose a
 * price from the ladder (F-040). Each runs as the
 * signed-in person through the 0020 functions, which check the role, the
 * hash and the licence again and write the audit row. Redirects carry a
 * fixed notice code only.
 */

function back(workbookId: string, notice: ReleaseNotice, orgId?: string): never {
  const p = withOrg(`/studio/workbooks/${workbookId}`, orgId, Boolean(orgId));
  redirect(`${p}${p.includes("?") ? "&" : "?"}notice=${notice}#${notice === "price-sent" ? "price-h" : "sign-h"}`);
}

function orgOf(fd: FormData): string | undefined {
  const o = fd.get("org");
  return isUuid(o) ? o : undefined;
}

export async function signOffVersion(fd: FormData): Promise<void> {
  const workbookId = fd.get("workbook");
  if (!isUuid(workbookId)) redirect("/studio/workbooks");
  const org = orgOf(fd);
  await requireStudio(`/studio/workbooks/${workbookId}`, org);
  const parsed = parseStudioSignoff((k) => fd.get(k));
  if (!parsed.ok) back(workbookId, parsed.field === "confirm" ? "confirm" : parsed.field === "signer_name" ? "name" : "invalid", org);
  const s = parsed.value;
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("author_signoff", {
    p_version: s.versionId,
    p_content_hash: s.contentHash,
    p_kind: s.kind,
    p_signer_name: s.signerName,
    p_note: s.note,
  });
  if (error) {
    console.error("studio_signoff_failed", error.code ?? "");
    back(workbookId, releaseErrorNotice(error.code), org);
  }
  revalidatePath(`/studio/workbooks/${workbookId}`);
  back(workbookId, "signed", org);
}

export async function choosePrice(fd: FormData): Promise<void> {
  const parsed = parsePriceChoice((k) => fd.get(k));
  const org = orgOf(fd);
  if (!parsed.ok) {
    const w = fd.get("workbook");
    if (isUuid(w)) back(w, "invalid", org);
    redirect("/studio/workbooks");
  }
  const c = parsed.value;
  await requireStudio(`/studio/workbooks/${c.workbookId}`, org);
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("price_choose", { p_workbook: c.workbookId, p_point: c.point, p_in_membership: c.inMembership });
  if (error) {
    console.error("studio_price_failed", error.code ?? "");
    back(c.workbookId, releaseErrorNotice(error.code), org);
  }
  revalidatePath(`/studio/workbooks/${c.workbookId}`);
  back(c.workbookId, "price-sent", org);
}

/** Post on the workbook's comment thread (F-039). public.workbook_comment_post checks the role and audits. */
export async function postWorkbookComment(fd: FormData): Promise<void> {
  const workbookId = fd.get("workbook");
  if (!isUuid(workbookId)) redirect("/studio/workbooks");
  const org = orgOf(fd);
  await requireStudio(`/studio/workbooks/${workbookId}`, org);
  const notice = await postComment(workbookId, fd.get("body"));
  revalidatePath(`/studio/workbooks/${workbookId}`);
  const p = withOrg(`/studio/workbooks/${workbookId}`, org, Boolean(org));
  redirect(`${p}${p.includes("?") ? "&" : "?"}thread=${notice}#thread-h`);
}
