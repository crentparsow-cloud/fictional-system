/**
 * One line of feedback after an admin action. The URL carries a fixed code,
 * never free text, so nothing a visitor types is echoed back.
 */
const MESSAGES: Record<string, { tone: "ok" | "error"; text: string }> = {
  status: { tone: "ok", text: "Status updated." },
  paused: { tone: "ok", text: "Workbook paused. It is off sale and out of the library." },
  resumed: { tone: "ok", text: "Workbook resumed. It is live again." },
  invalid: { tone: "error", text: "That request was not valid. Nothing changed." },
  reason: { tone: "error", text: "Give a reason for the pause, in 500 characters or fewer." },
  denied: { tone: "error", text: "Your role cannot do that. Nothing changed." },
  stale: { tone: "error", text: "The status changed before your action landed. Check the row and try again." },
  failed: { tone: "error", text: "The change did not save. Try again." },
};

export function Notice({ code }: { code: string | string[] | undefined }) {
  const key = Array.isArray(code) ? code[0] : code;
  const m = key ? MESSAGES[key] : undefined;
  if (!m) return null;
  return (
    <p className={`admin-notice admin-notice-${m.tone}`} role={m.tone === "error" ? "alert" : "status"}>
      {m.text}
    </p>
  );
}
