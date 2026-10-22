"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminAbilities } from "@/lib/admin/permissions";
import { issueProblems, londonLocalToDate, parseIssueForm } from "@/lib/newsletter";
import type { IssueFormState, IssueFormValues } from "@/lib/newsletter-form";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Staff compose, schedule and cancel the weekly issue (6.11). Owners and
 * editors only; the 0063 functions check the role again and write the audit
 * row. Before anything saves, the text is checked against house style and
 * against every workbook and book title, because no email names a title.
 * Nothing sends from here: the cron route sends, and only while the sending
 * guards are met.
 */
const HOME = "/admin/newsletter";

const val = (f: FormData, k: string): string => (typeof f.get(k) === "string" ? String(f.get(k)) : "");

function valuesOf(f: FormData): IssueFormValues {
  return {
    id: val(f, "id"),
    subject: val(f, "subject"),
    preheader: val(f, "preheader"),
    intro: val(f, "intro"),
    exercise_heading: val(f, "exercise_heading"),
    exercise_body: val(f, "exercise_body"),
    sponsor_name: val(f, "sponsor_name"),
    sponsor_text: val(f, "sponsor_text"),
    sponsor_url: val(f, "sponsor_url"),
    send_at: val(f, "send_at"),
  };
}

export async function saveIssue(_prev: IssueFormState, formData: FormData): Promise<IssueFormState> {
  const staff = await getStaffSession(HOME);
  const values = valuesOf(formData);
  if (!adminAbilities(staff.roles).curateCatalogue) return { status: "error", errors: ["Your role cannot write the newsletter."], warnings: [], values };

  const supabase = await createUserClient();
  const [wb, bk] = await Promise.all([supabase.from("workbooks").select("title, short_title").limit(5000), supabase.from("books").select("title").limit(5000)]);
  const titles = [
    ...((wb.data ?? []) as { title: string; short_title: string | null }[]).flatMap((w) => [w.title, w.short_title ?? ""]),
    ...((bk.data ?? []) as { title: string }[]).map((b) => b.title),
  ].filter(Boolean);

  const input = parseIssueForm(formData);
  const { errors, warnings } = issueProblems(input, titles);
  if (errors.length) return { status: "error", errors, warnings, values };

  const at = londonLocalToDate(input.sendAtLocal);
  const { error } = await supabase.rpc("save_newsletter_issue", {
    p_id: input.id,
    p_subject: input.subject,
    p_preheader: input.preheader,
    p_intro: input.intro,
    p_exercise_heading: input.exerciseHeading,
    p_exercise_body: input.exerciseBody,
    p_sponsor_name: input.sponsorName,
    p_sponsor_text: input.sponsorText,
    p_sponsor_url: input.sponsorUrl,
    p_scheduled_for: at ? at.toISOString() : null,
    p_schedule: input.schedule,
  });
  if (error) {
    console.error("admin_newsletter_save_failed", error.code ?? "");
    const message =
      error.code === "insufficient_privilege"
        ? "Your role cannot write the newsletter."
        : error.code === "AKN05"
          ? "That issue is already going out and cannot be changed."
          : error.code === "AKN06"
            ? "The send time must be in the future."
            : error.code?.startsWith("AKN")
              ? "The database refused one of the fields. Check the lengths and the link."
              : "The issue did not save. Try again.";
    return { status: "error", errors: [message], warnings, values };
  }
  revalidatePath(HOME);
  return { status: "ok", message: input.schedule ? "Scheduled. It sends on that day once the sending settings are complete." : "Saved as a draft.", warnings };
}

export async function cancelIssue(formData: FormData): Promise<void> {
  const staff = await getStaffSession(HOME);
  if (!adminAbilities(staff.roles).curateCatalogue) redirect(`${HOME}?notice=denied`);
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) redirect(`${HOME}?notice=invalid`);
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("cancel_newsletter_issue", { p_id: id });
  if (error) {
    console.error("admin_newsletter_cancel_failed", error.code ?? "");
    redirect(`${HOME}?notice=${error.code === "AKN05" ? "sending" : "failed"}`);
  }
  revalidatePath(HOME);
  redirect(`${HOME}?notice=cancelled`);
}
