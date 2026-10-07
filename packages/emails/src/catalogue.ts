// The catalogue: every template this package can send, with one line on
// when it goes. The types make it complete, so a new template does not
// typecheck until it has a line here. Keep each line short, in UK English,
// with no em dashes. The sign-in emails (SIGNIN_TEMPLATES in reader.ts) are
// pasted into Supabase rather than sent from here, so they are not listed.

import type { AuthorTemplateName } from "./author";
import type { ReaderTemplateName } from "./reader";

export const READER_TEMPLATE_CATALOGUE: { [K in ReaderTemplateName]: string } = {
  welcome: "Sent when a reader starts a workbook. Their free first unit is open.",
  first_unit_finished: "Sent when a reader finishes the free first unit. Nothing was charged.",
  purchase_lifetime: "Confirms a one-off purchase and the terms agreed at checkout.",
  purchase_membership: "Confirms a new membership: price, how often, next payment and how to cancel.",
  renewal_notice: "Annual members, before each renewal: the date, the amount and how to cancel.",
  membership_terms_reminder: "Monthly members, every six months before a payment: price, how often, next payment and how to cancel.",
  membership_away: "A member who has been away: the membership is still active, and how to cancel.",
  payment_failed: "A renewal payment failed. Asks the member to check their payment details.",
  cancellation: "Confirms a cancel: ended now with any cooling-off refund, or ending at the period end.",
  account_deleted: "Account deletion scheduled (with the undo link), or finished.",
  export_code: "The one-time code to download a copy of the reader's answers.",
  partner_accepted: "Tells the reader their check-in partner said yes.",
  passkey_added: "Security notice: a passkey was added.",
  password_changed: "Security notice: the password was changed.",
  email_changed: "Security notice: the sign-in email was changed.",
  history_downloaded: "Security notice: the reader's answers were downloaded.",
  stage_complete: "Progress: the reader finished a stage.",
  inactive_7: "Progress: a gentle nudge after 7 days away.",
  inactive_14: "Progress: a nudge after 14 days away.",
  inactive_30: "Progress: a last nudge after 30 days away.",
  maintenance: "Progress: two monthly check-in questions about the reader's plan.",
  crosssell_general: "Marketing: workbooks in general, for readers who opted in.",
  crosssell_personal: "Marketing: three workbooks from the reader's themes, for readers who asked.",
  new_workbook_available: "Marketing: a new workbook is on Akana, named by its theme.",
  partner_invite: "To a check-in partner: the reader's invitation to accept or decline.",
  partner_update: "To a check-in partner: a short update on how far the reader has got.",
  partner_stopped: "To a check-in partner: the updates have stopped.",
};

export const AUTHOR_TEMPLATE_CATALOGUE: { [K in AuthorTemplateName]: string } = {
  invite: "Invites an author to publish with an organisation.",
  submission_received: "Confirms a workbook was submitted for review.",
  changes_requested: "Review notes: changes to make before the workbook can go on.",
  ready_for_sign_off: "The workbook is ready for the author to sign off.",
  live: "The workbook is live.",
  paused: "The workbook has been paused.",
  payout_action_needed: "Something is needed before a payout can be made.",
  statement_ready: "A new earnings statement is ready.",
  payout_details_changed: "Security notice to owners and finance: payout or tax details changed.",
  lead_received: "To the Akana team: someone sent the publish enquiry form.",
  review_assigned: "To an Akana reviewer: a workbook version was assigned to them, by AK code only.",
  ops_alert: "To the Akana operator: an operational alert opened, with kind, route and code only.",
};
