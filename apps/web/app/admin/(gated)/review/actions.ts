"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "@/lib/admin/leads";
import { adminAbilities } from "@/lib/admin/permissions";
import { parseReason, parseSignoff, reviewErrorNotice } from "@/lib/admin/review";
import { sendReviewAssigned } from "@/lib/review-mail";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Review queue and release gate actions (F-084, F-085, F-155). Every write
 * goes through a 0016 function on the user client, which checks the role,
 * the content hash and the gate again and writes the audit row. The checks
 * here only decide where to send the browser back to.
 */

function back(versionId: string, notice: string): never {
  redirect(`/admin/review/${versionId}?notice=${notice}`);
}

async function start(fd: FormData, need: "review" | "release") {
  const id = fd.get("version");
  if (!isUuid(id)) redirect("/admin/review?notice=invalid");
  const versionId = id.toLowerCase();
  const staff = await getStaffSession(`/admin/review/${versionId}`);
  const can = adminAbilities(staff.roles);
  if (need === "review" ? !can.readReviewQueue : !can.releaseVersions) back(versionId, "denied");
  return { versionId, staff, supabase: await createUserClient() };
}

function failed(versionId: string, tag: string, code: string | undefined): never {
  console.error(`admin_review_${tag}_failed`, code ?? "");
  back(versionId, reviewErrorNotice(code));
}

function done(versionId: string, notice: string): never {
  revalidatePath(`/admin/review/${versionId}`);
  revalidatePath("/admin/review");
  back(versionId, notice);
}

export async function assignReview(fd: FormData): Promise<void> {
  const { versionId, staff, supabase } = await start(fd, "release");
  const assignee = fd.get("assignee");
  if (!isUuid(assignee)) back(versionId, "invalid");
  const { data, error } = await supabase.rpc("review_assign", { p_version: versionId, p_assignee: assignee });
  if (error) failed(versionId, "assign", error.code);

  const { data: row } = await supabase.from("workbook_versions").select("workbook_id").eq("id", versionId).maybeSingle();
  const wbId = (row as { workbook_id?: string } | null)?.workbook_id;
  const { data: wb } = wbId ? await supabase.from("workbooks").select("code").eq("id", wbId).maybeSingle() : { data: null };
  const code = (wb as { code?: string } | null)?.code;

  let mailed = false;
  if (typeof data === "string" && data && code) {
    try {
      const h = await headers();
      const host = process.env.AKANA_HOST ?? h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
      const origin = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
      const env = process.env;
      mailed = await sendReviewAssigned(
        data,
        { code, versionId, assignedBy: staff.email },
        {
          origin,
          env: {
            RESEND_API_KEY: env.RESEND_API_KEY,
            EMAIL_FROM: env.EMAIL_FROM,
            EMAIL_REPLY_TO: env.EMAIL_REPLY_TO,
            EMAIL_MODE: env.EMAIL_MODE,
            TEST_RECIPIENT: env.TEST_RECIPIENT,
            POSTAL_ADDRESS: env.POSTAL_ADDRESS,
          },
        },
      );
    } catch (e) {
      console.error("review_assigned_email_failed", e instanceof Error ? e.name : "unknown");
    }
  }
  done(versionId, mailed ? "assigned" : "assigned_no_mail");
}

export async function addReviewNote(fd: FormData): Promise<void> {
  const { versionId, supabase } = await start(fd, "review");
  const body = parseReason(fd.get("body"), 2000);
  if (!body) back(versionId, "review_invalid");
  const { error } = await supabase.rpc("review_add_note", { p_version: versionId, p_body: body });
  if (error) failed(versionId, "note", error.code);
  done(versionId, "noted");
}

export async function sendBack(fd: FormData): Promise<void> {
  const { versionId, supabase } = await start(fd, "review");
  const reason = parseReason(fd.get("reason"), 2000);
  if (!reason) back(versionId, "review_invalid");
  const { error } = await supabase.rpc("review_send_back", { p_version: versionId, p_reason: reason });
  if (error) failed(versionId, "send_back", error.code);
  done(versionId, "sent_back");
}

export async function recordSignoff(fd: FormData): Promise<void> {
  const { versionId, supabase } = await start(fd, "review");
  const parsed = parseSignoff((k) => fd.get(k));
  if (!parsed.ok) back(versionId, parsed.field === "tradition_match" ? "tradition_match" : "review_invalid");
  const s = parsed.value;
  const { error } = await supabase.rpc("record_signoff", {
    p_version: versionId,
    p_kind: s.kind,
    p_signer_name: s.signerName,
    p_reviewer_tradition: s.reviewerTradition,
    p_tradition_label: s.traditionLabel,
    p_note: s.note,
  });
  if (error) failed(versionId, "signoff", error.code);
  done(versionId, "signed");
}

export async function setLicenceRecord(fd: FormData): Promise<void> {
  const { versionId, supabase } = await start(fd, "release");
  const workbook = fd.get("workbook");
  const ref = parseReason(fd.get("licence_ref"), 300);
  if (!isUuid(workbook) || !ref) back(versionId, "review_invalid");
  const { error } = await supabase.rpc("set_licence_record", { p_workbook: workbook, p_ref: ref });
  if (error) failed(versionId, "licence", error.code);
  done(versionId, "licence");
}

export async function requestOverride(fd: FormData): Promise<void> {
  const { versionId, supabase } = await start(fd, "release");
  const reason = parseReason(fd.get("reason"), 1000);
  if (!reason) back(versionId, "review_invalid");
  const { error } = await supabase.rpc("request_release_override", { p_version: versionId, p_reason: reason });
  if (error) failed(versionId, "override_request", error.code);
  done(versionId, "override_requested");
}

export async function approveOverride(fd: FormData): Promise<void> {
  const { versionId, supabase } = await start(fd, "release");
  const override = fd.get("override");
  if (!isUuid(override)) back(versionId, "invalid");
  const { error } = await supabase.rpc("approve_release_override", { p_override: override });
  if (error) failed(versionId, "override_approve", error.code);
  done(versionId, "override_approved");
}

export async function releaseVersion(fd: FormData): Promise<void> {
  const { versionId, supabase } = await start(fd, "release");
  const goLive = fd.get("go_live") === "1";
  const override = fd.get("override");
  const { data, error } = await supabase.rpc("release_version", {
    p_version: versionId,
    p_go_live: goLive,
    p_override: isUuid(override) ? override : null,
  });
  if (error) failed(versionId, "release", error.code);
  revalidatePath("/admin/workbooks");
  revalidatePath("/admin");
  done(versionId, data === "live" ? "released" : "approved");
}
