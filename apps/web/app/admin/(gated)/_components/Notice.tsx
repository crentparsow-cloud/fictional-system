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
  // Author release (0020)
  version_saved: { tone: "ok", text: "Saved as a new version. Sign-offs on the old content do not carry over." },
  author_mailed: { tone: "ok", text: "Done. The author has been emailed." },
  author_not_mailed: { tone: "ok", text: "Done. The email to the author did not send, or there is nobody to send it to." },
  price_approved: { tone: "ok", text: "Price approved. The workbook now carries it." },
  price_declined: { tone: "ok", text: "Price choice declined with your reason." },
  // Ops and support (0016)
  acknowledged: { tone: "ok", text: "Alert acknowledged. The next failure opens a new one." },
  // White-label sites and the demo (0023)
  brand_saved: { tone: "ok", text: "Brand saved. The site shows it within a minute." },
  brand_invalid: { tone: "error", text: "The brand was not saved. Check the contrast table and the fields: every colour pair needs 4.5 to 1." },
  listing_saved: { tone: "ok", text: "Listing saved." },
  listing_added: { tone: "ok", text: "Workbook added to the site. It shows once it is live." },
  listing_removed: { tone: "ok", text: "Workbook removed from the site." },
  listing_refused: { tone: "error", text: "That workbook cannot go on this site. A tenant lists its own workbooks, and a demo site lists demo workbooks only." },
  listing_price: { tone: "error", text: "Pick a workbook point from the ladder." },
  listing_exists: { tone: "error", text: "That workbook is already on the site." },
  listing_unknown: { tone: "error", text: "No workbook has that AK code." },
  demo_reset: { tone: "ok", text: "Demo reset. The publisher, its site and its logins are back to the start." },
  demo_login_added: { tone: "ok", text: "Demo login registered. Reset the demo to give it its place." },
  demo_login_removed: { tone: "ok", text: "Demo login removed." },
  demo_login_refused: { tone: "error", text: "That account cannot be a demo login. It must already exist, must not be staff and must not belong to a real organisation." },
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
