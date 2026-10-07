/**
 * One line of feedback after an admin action. The URL carries a fixed code,
 * never free text, so nothing a visitor types is echoed back.
 */
const MESSAGES: Record<string, { tone: "ok" | "error"; text: string }> = {
  status: { tone: "ok", text: "Status updated." },
  paused: { tone: "ok", text: "Workbook paused. It is off sale and out of the library." },
  resumed: { tone: "ok", text: "Workbook resumed. It is live again." },
  invalid: { tone: "error", text: "That request was not valid. Nothing changed." },
  reason: { tone: "error", text: "Give a reason, in 500 characters or fewer." },
  created: { tone: "ok", text: "Organisation created." },
  org_invalid: { tone: "error", text: "Check the form. Every field is needed, and the country is a two-letter code like GB." },
  org_slug: { tone: "error", text: "An organisation with that name already exists. Use a different display name." },
  denied: { tone: "error", text: "Your role cannot do that. Nothing changed." },
  stale: { tone: "error", text: "The status changed before your action landed. Check the row and try again." },
  failed: { tone: "error", text: "The change did not save. Try again." },
  // Review queue and release gate (0016)
  assigned: { tone: "ok", text: "Review assigned. The reviewer has been emailed." },
  assigned_no_mail: { tone: "ok", text: "Review assigned. The email to the reviewer did not send." },
  noted: { tone: "ok", text: "Note added." },
  sent_back: { tone: "ok", text: "Sent back with your reason." },
  signed: { tone: "ok", text: "Sign-off recorded against this version's content." },
  licence: { tone: "ok", text: "Licence record saved." },
  override_requested: { tone: "ok", text: "Override asked for. A second member of staff must approve it." },
  override_approved: { tone: "ok", text: "Override approved." },
  released: { tone: "ok", text: "Released. The workbook is live." },
  approved: { tone: "ok", text: "Approved. It is not live yet." },
  gate_refused: { tone: "error", text: "Release refused. A requirement is not met and no approved override covers it." },
  gate_changed: { tone: "error", text: "The content changed since that check or sign-off. Look again before going on." },
  override_same_person: { tone: "error", text: "A different member of staff must approve an override." },
  review_invalid: { tone: "error", text: "Check the form. A name, reason or tradition is missing or does not fit." },
  licence_inactive: { tone: "error", text: "The book has no active licence yet, so the workbook cannot go live." },
  tradition_match: { tone: "error", text: "A title labelled for one tradition needs a reviewer from that tradition." },
  // Ops and support (0016)
  acknowledged: { tone: "ok", text: "Alert acknowledged. The next failure opens a new one." },
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
