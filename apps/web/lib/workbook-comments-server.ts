import "server-only";
import { createMailer, type MailerEnv, type Transport } from "@akana/emails";
import { mailLog } from "@/lib/mail-ops";
import { mailerEnvFromProcess } from "@/lib/partner-mail";
import { siteOrigin } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import { firstName } from "@/lib/support-actions";
import { parseCommentBody, readComments, threadErrorNotice, type CommentRow, type ThreadNotice } from "@/lib/workbook-comments";

/**
 * The workbook comment thread on the server (F-039, migration 0027).
 *
 * Reading runs as the signed-in person, so the 0027 policy decides: the
 * organisation's members and Akana reviewers. Posting runs as them too,
 * through public.workbook_comment_post, which picks the side, checks the
 * role and the length, rate limits and audits without the text.
 *
 * When the post says to notify (not when the same side posted in the last
 * 10 minutes), one email per person goes to the other side: owners, editors
 * and authors of the organisation for an Akana comment; the assigned
 * reviewers and staff already on the thread for an organisation comment, or
 * REVIEW_NOTIFY_TO when there is nobody yet. The emails carry no comment
 * text. Recipients are read with the service role
 * (public.workbook_comment_recipients) and a failed send opens an ops event.
 */

export async function loadThread(workbookId: string): Promise<CommentRow[]> {
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("workbook_comments")
    .select("id, side, author_id, author_name, body, created_at")
    .eq("workbook_id", workbookId)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) console.error("workbook_comments_read_failed", error.code ?? "");
  return readComments(data ?? []);
}

export async function postComment(workbookId: string, raw: unknown, o: { env?: MailerEnv; transport?: Transport } = {}): Promise<ThreadNotice> {
  const parsed = parseCommentBody(raw);
  if (!parsed.ok) return parsed.notice;
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("workbook_comment_post", { p_workbook: workbookId, p_body: parsed.body });
  if (error) {
    console.error("workbook_comment_post_failed", error.code ?? "");
    return threadErrorNotice(error.code);
  }
  const row = (Array.isArray(data) ? data[0] : data) as { comment_id?: string; side?: string; notify?: boolean } | undefined;
  if (!row?.comment_id) return "failed";
  if (!row.notify) return "posted_quiet";
  await notifyOtherSide(row.comment_id, row.side === "staff" ? "staff" : "org", o);
  return "posted";
}

type Recipient = { email: string; display_name: string | null; audience: "org" | "staff"; workbook_code: string; workbook_title: string | null; workbook_id: string };

async function notifyOtherSide(commentId: string, side: "org" | "staff", o: { env?: MailerEnv; transport?: Transport }): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("workbook_comment_recipients", { p_comment: commentId });
    if (error) {
      console.error("workbook_comment_recipients_failed", error.code ?? "");
      return;
    }
    let people = (Array.isArray(data) ? data : []) as Recipient[];
    const env = o.env ?? mailerEnvFromProcess();
    const origin = siteOrigin();
    const mailer = createMailer({ env, isSuppressed: () => false, log: mailLog("workbook-comments", "comment_mail"), ...(o.transport ? { transport: o.transport } : {}) });

    if (side === "org") {
      // An organisation comment goes to Akana. Fall back to the review inbox when nobody is assigned yet.
      const { data: wb } = await admin.from("workbook_comments").select("workbook_id, workbooks(code)").eq("id", commentId).maybeSingle();
      const w = wb as { workbook_id?: string; workbooks?: { code?: string } | { code?: string }[] | null } | null;
      const code = (Array.isArray(w?.workbooks) ? w?.workbooks[0]?.code : w?.workbooks?.code) ?? people[0]?.workbook_code ?? "";
      const workbookId = w?.workbook_id ?? people[0]?.workbook_id ?? "";
      if (people.length === 0) {
        const inbox = (process.env.REVIEW_NOTIFY_TO || process.env.LEADS_NOTIFY_TO || "").trim();
        if (inbox) people = [{ email: inbox, display_name: null, audience: "staff", workbook_code: code, workbook_title: null, workbook_id: workbookId }];
      }
      const { data: v } = await admin.from("workbook_versions").select("id").eq("workbook_id", workbookId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const reviewUrl = v && (v as { id?: string }).id ? `${origin}/admin/review/${(v as { id: string }).id}` : `${origin}/admin/review`;
      for (const p of people) {
        await mailer.sendAuthor(
          "review_comment",
          { name: firstName(p.display_name), code: code || p.workbook_code, studioUrl: `${reviewUrl}#thread-h`, supportEmail: env.EMAIL_REPLY_TO ?? "" },
          { to: p.email },
        );
      }
      return;
    }

    for (const p of people) {
      if (p.audience !== "org" || !p.workbook_title) continue;
      await mailer.sendAuthor(
        "workbook_comment",
        {
          name: firstName(p.display_name),
          workbookTitle: p.workbook_title,
          studioUrl: `${origin}/studio/workbooks/${p.workbook_id}#thread-h`,
          supportEmail: env.EMAIL_REPLY_TO ?? "",
        },
        { to: p.email },
      );
    }
  } catch (e) {
    console.error("workbook_comment_notify_failed", e instanceof Error ? e.name : "unknown");
  }
}
