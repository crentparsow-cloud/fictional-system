import "server-only";
import { createMailer, type AuthorProps, type MailerEnv, type Transport } from "@akana/emails";
import { mailLog } from "@/lib/mail-ops";
import { mailerEnvFromProcess } from "@/lib/partner-mail";
import { siteOrigin } from "@/lib/site-url";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Author status emails (F-043): submission accepted or declined, changes requested,
 * ready for sign-off, approved, live and paused. Sent from the staff action
 * that moved the workbook on, to the owning organisation's owners, editors
 * and authors (public.author_mail_recipients, 0020, reviewers only). The
 * email may name the workbook, because the recipient wrote it. It never
 * names or describes a reader.
 *
 * A failed send never undoes the action: the caller gets a count and the
 * page says whether the email went. Without RESEND_API_KEY nothing leaves.
 */

export type AuthorStatusTemplate = "submission_accepted" | "submission_declined" | "changes_requested" | "ready_for_sign_off" | "approved" | "live" | "paused";

export interface AuthorStatusExtra {
  /** changes_requested: the reasons, as the reviewer wrote them. */
  notes?: string[];
  /** paused and submission_declined: a short reason for the author. */
  reason?: string;
  /** The version the email is about, for the dedupe key. */
  versionId?: string | null;
}

interface WorkbookRow {
  id: string;
  title: string;
  slug: string;
}

function firstName(display: string | null | undefined): string | undefined {
  const n = (display ?? "").trim().split(/\s+/)[0];
  return n ? n.slice(0, 60) : undefined;
}

export function authorStatusProps(
  template: AuthorStatusTemplate,
  w: WorkbookRow,
  origin: string,
  supportEmail: string,
  name: string | undefined,
  extra: AuthorStatusExtra = {},
): AuthorProps[AuthorStatusTemplate] {
  const studioUrl = `${origin}/studio/workbooks/${w.id}`;
  const base = { name, workbookTitle: w.title, studioUrl, supportEmail };
  switch (template) {
    case "changes_requested":
      return { ...base, notes: extra.notes?.length ? extra.notes : ["See the notes in the Studio."], reviewUrl: studioUrl };
    case "ready_for_sign_off":
      return { ...base, signOffUrl: studioUrl };
    case "live":
      return { ...base, liveUrl: `${origin}/w/${w.slug}` };
    case "paused":
      return { ...base, reason: extra.reason };
    case "submission_declined":
      return { ...base, reason: extra.reason?.trim() || "The reason is in the Studio." };
    default:
      return base;
  }
}

/**
 * Email the organisation about a workbook. Runs as the signed-in member of
 * staff, so the recipients function decides whether they may. Returns how
 * many emails went (sent or sent to the test inbox).
 */
export async function sendAuthorStatus(
  workbookId: string,
  template: AuthorStatusTemplate,
  extra: AuthorStatusExtra = {},
  o: { env?: MailerEnv; transport?: Transport } = {},
): Promise<number> {
  try {
    const supabase = await createUserClient();
    const [{ data: wb }, { data: people, error }] = await Promise.all([
      supabase.from("workbooks").select("id, title, slug").eq("id", workbookId).maybeSingle(),
      supabase.rpc("author_mail_recipients", { p_workbook: workbookId }),
    ]);
    if (error) console.error("author_mail_recipients_failed", error.code ?? "");
    if (!wb || !people || !Array.isArray(people) || people.length === 0) return 0;
    const env = o.env ?? mailerEnvFromProcess();
    const mailer = createMailer({
      env,
      isSuppressed: () => false,
      log: mailLog("admin/author-status", "author_status_mail"),
      ...(o.transport ? { transport: o.transport } : {}),
    });
    const origin = siteOrigin();
    let sent = 0;
    for (const p of people as { email: string; display_name: string | null }[]) {
      const props = authorStatusProps(template, wb as WorkbookRow, origin, env.EMAIL_REPLY_TO ?? "", firstName(p.display_name), extra);
      const r = await mailer.sendAuthor(template, props as never, {
        to: p.email,
        dedupeKey: extra.versionId ? `author:${template}:${extra.versionId}:${p.email}` : undefined,
      });
      if (r.status === "sent" || r.status === "sent_test") sent += 1;
    }
    return sent;
  } catch (e) {
    console.error("author_status_mail_failed", e instanceof Error ? e.name : "unknown");
    return 0;
  }
}
