/**
 * The workbook comment thread (F-039, migration 0027). Pure: the body check,
 * the notice codes and the row shape. One thread per workbook, between the
 * author organisation and Akana reviewers. Plain text, up to 2000
 * characters, no attachments. Emails about a comment never carry its text.
 */

export const COMMENT_MAX = 2000;

export interface CommentRow {
  id: string;
  side: "org" | "staff";
  author_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
}

/** Trim, keep line breaks, drop other control characters. Null when empty or too long. */
export function parseCommentBody(raw: unknown): { ok: true; body: string } | { ok: false; notice: "empty" | "long" } {
  const s = typeof raw === "string" ? raw.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim() : "";
  if (!s) return { ok: false, notice: "empty" };
  if (s.length > COMMENT_MAX) return { ok: false, notice: "long" };
  return { ok: true, body: s };
}

export type ThreadNotice = "posted" | "posted_quiet" | "empty" | "long" | "denied" | "busy" | "failed";

const NOTICES: Record<ThreadNotice, { tone: "ok" | "error"; text: string }> = {
  posted: { tone: "ok", text: "Comment posted. The other side has been told there is a new comment, without its text." },
  posted_quiet: { tone: "ok", text: "Comment posted. They were emailed about an earlier comment a few minutes ago, so no new email went." },
  empty: { tone: "error", text: "Write a comment first." },
  long: { tone: "error", text: `A comment can be up to ${COMMENT_MAX} characters.` },
  denied: { tone: "error", text: "Your role cannot post on this thread." },
  busy: { tone: "error", text: "You have posted a lot of comments in the last hour. Try again later." },
  failed: { tone: "error", text: "The comment was not posted. Try again." },
};

export function threadNotice(code: unknown): { tone: "ok" | "error"; text: string } | null {
  return typeof code === "string" && code in NOTICES ? NOTICES[code as ThreadNotice] : null;
}

export function threadErrorNotice(code: string | null | undefined): ThreadNotice {
  if (code === "AKX01" || code === "AKX04") return "denied";
  if (code === "AKX02") return "long";
  if (code === "AKX29") return "busy";
  return "failed";
}

export function readComments(raw: unknown): CommentRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const r = x as Record<string, unknown>;
    if (typeof r.id !== "string" || (r.side !== "org" && r.side !== "staff") || typeof r.body !== "string") return [];
    return [
      {
        id: r.id,
        side: r.side,
        author_id: typeof r.author_id === "string" ? r.author_id : null,
        author_name: typeof r.author_name === "string" ? r.author_name : "",
        body: r.body,
        created_at: typeof r.created_at === "string" ? r.created_at : "",
      },
    ];
  });
}
