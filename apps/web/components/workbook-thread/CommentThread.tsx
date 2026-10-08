import { COMMENT_MAX, threadNotice, type CommentRow } from "@/lib/workbook-comments";

/**
 * The single comment thread for a workbook (F-039), shown in the Studio and
 * in admin review. Plain text only: React escapes the body and CSS keeps the
 * line breaks. No attachments, no links made clickable, no editing.
 */
export function CommentThread({
  comments,
  viewerId,
  viewerSide,
  orgName,
  action,
  hidden,
  canPost,
  cannotPostLine,
  notice,
}: {
  comments: CommentRow[];
  viewerId: string;
  viewerSide: "org" | "staff";
  orgName: string;
  action: (fd: FormData) => Promise<void>;
  hidden: Record<string, string>;
  canPost: boolean;
  cannotPostLine: string;
  notice: unknown;
}) {
  const n = threadNotice(notice);
  const when = (s: string) =>
    s ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(new Date(s)) : "";
  const who = (c: CommentRow) => {
    if (c.author_id && c.author_id === viewerId) return "You";
    if (c.side === "staff") return viewerSide === "staff" ? `${c.author_name}, Akana` : `${c.author_name}, Akana team`;
    return viewerSide === "org" ? c.author_name : `${c.author_name}, ${orgName}`;
  };
  return (
    <section className="card admin-create comment-thread" aria-labelledby="thread-h">
      <h2 id="thread-h">Comments</h2>
      <p className="muted small">
        One thread between {viewerSide === "org" ? "your team and the Akana team" : `${orgName} and the Akana team`}. Plain text only. Each side gets an email that a
        comment is waiting, never the comment itself.
      </p>
      {n ? (
        <p className={`admin-notice admin-notice-${n.tone}`} role={n.tone === "error" ? "alert" : "status"}>
          {n.text}
        </p>
      ) : null}
      {comments.length === 0 ? (
        <p className="muted">No comments yet.</p>
      ) : (
        <ol className="comment-list">
          {comments.map((c) => (
            <li key={c.id} className={`comment comment-${c.side}`}>
              <p className="comment-meta">
                <strong>{who(c)}</strong> <span className="muted small">{when(c.created_at)}</span>
              </p>
              <p className="admin-message comment-body">{c.body}</p>
            </li>
          ))}
        </ol>
      )}
      {canPost ? (
        <form action={action} className="admin-form studio-wide" autoComplete="off">
          {Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <label htmlFor="thread-body">Add a comment</label>
          <textarea id="thread-body" name="body" rows={4} maxLength={COMMENT_MAX} required aria-describedby="thread-hint" />
          <p id="thread-hint" className="muted small">
            Up to {COMMENT_MAX} characters. Comments are kept with the workbook and cannot be edited.
          </p>
          <div className="admin-actions">
            <button type="submit" className="btn secondary">
              Post comment
            </button>
          </div>
        </form>
      ) : (
        <p className="muted small">{cannotPostLine}</p>
      )}
    </section>
  );
}
