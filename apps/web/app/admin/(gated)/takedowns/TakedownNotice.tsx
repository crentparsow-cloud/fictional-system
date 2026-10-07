/** One line of feedback after a takedown action. Fixed codes only, never free text. */
const MESSAGES: Record<string, { tone: "ok" | "error"; text: string }> = {
  reviewing: { tone: "ok", text: "Marked as reviewing." },
  withdrawn: { tone: "ok", text: "Marked as withdrawn by the sender." },
  rejected: { tone: "ok", text: "Notice rejected. Nothing changed on the title." },
  actioned: { tone: "ok", text: "Title taken down. It is off sale, out of the library and out of the membership." },
  reinstated: { tone: "ok", text: "Title reinstated. Its earlier status and membership setting are back." },
  denied: { tone: "error", text: "Your role cannot do that. Nothing changed." },
  td_invalid: { tone: "error", text: "Check the form. A reason, the statement of reasons or the workbook is missing or too long." },
  td_state: { tone: "error", text: "The notice or takedown has already moved on. Check it and try again." },
  td_workbook: { tone: "error", text: "No workbook has that AK code." },
  invalid: { tone: "error", text: "That request was not valid. Nothing changed." },
  failed: { tone: "error", text: "The change did not save. Try again." },
};

export function TakedownNotice({ code }: { code: string | string[] | undefined }) {
  const key = Array.isArray(code) ? code[0] : code;
  const m = key ? MESSAGES[key] : undefined;
  if (!m) return null;
  return (
    <p className={`admin-notice admin-notice-${m.tone}`} role={m.tone === "error" ? "alert" : "status"}>
      {m.text}
    </p>
  );
}
