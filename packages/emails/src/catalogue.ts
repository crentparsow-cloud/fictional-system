// The catalogue: every template this package can send, with one line on
// when it goes. The types make it complete, so a new template does not
// typecheck until it has a line here. Keep each line short, in UK English,
// with no em dashes. The sign-in emails (SIGNIN_TEMPLATES in reader.ts) are
// pasted into Supabase rather than sent from here, so they are not listed.

import type { AuthorTemplateName } from "./author";
import type { ReaderTemplateName } from "./reader";
import type { OrganisationTemplateName } from "./organisation";

export const READER_TEMPLATE_CATALOGUE: { [K in ReaderTemplateName]: string } = {
  welcome: "Sent when a reader starts a workbook. Their free first unit is open.",
  first_unit_finished: "Sent when a reader finishes the free first unit. Nothing was charged.",
  purchase_lifetime: "Confirms a one-off purchase and the terms agreed at checkout.",
  purchase_membership: "Confirms a new membership: price, how often, next payment and how to cancel.",
  trial_started: "Day zero of a membership trial: the first week's plan as unit names, the trial dates and how to cancel. Not a receipt.",
  trial_ending: "Three days before a trial converts: the first payment date, the amount and how to cancel.",
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
  refund_confirmed: "Confirms a single-workbook refund made by Akana: the amount and whether access ended. No title.",
  deletion_cancelled: "Confirms that Akana support cancelled a pending account deletion at the reader's request.",
  step_reminder: "A reminder on the reader's chosen days (4.7). Starts \"Akana today:\", names the unit, never the title.",
  reminders_stopping: "The one email after unanswered reminders (14.3): they are stopping, and how to restart.",
  welcome_back: "One short, plain note after a long gap (4.9) to a reader who asked for reminders. No offer.",
};

export const AUTHOR_TEMPLATE_CATALOGUE: { [K in AuthorTemplateName]: string } = {
  invite: "Invites an author to publish with an organisation.",
  submission_received: "Confirms a workbook was submitted for review.",
  submission_accepted: "Staff accepted the submission into review.",
  changes_requested: "Review notes: changes to make before the workbook can go on.",
  ready_for_sign_off: "The workbook is ready for the author to sign off.",
  approved: "Every sign-off is in and staff approved the workbook. Not on sale yet.",
  live: "The workbook is live.",
  paused: "The workbook has been paused.",
  payout_action_needed: "Something is needed before a payout can be made.",
  statement_ready: "A new earnings statement is ready.",
  payout_details_changed: "Security notice to owners and finance: payout or tax details changed.",
  connect_onboarding_nudge: "Owner and finance, at most weekly: earnings are waiting on one Stripe Connect step. No title.",
  lead_received: "To the Akana team: someone sent the publish enquiry form.",
  review_assigned: "To an Akana reviewer: a workbook version was assigned to them, by AK code only.",
  ops_alert: "To the Akana operator: an operational alert opened, with kind, route and code only.",
  submission_declined: "Staff declined a submission, with the reason. Nothing goes live.",
  workbook_comment: "To the author organisation: Akana posted on the workbook's comment thread. No comment text.",
  review_comment: "To Akana reviewers: the author posted on a workbook's thread, by AK code only. No comment text.",
};

// Akana for organisations (0024, 0030, 0031). Billing emails go to the owner
// and finance contacts only, once per event, and never name a member.
export const ORGANISATION_TEMPLATE_CATALOGUE: { [K in OrganisationTemplateName]: string } = {
  seat_invite: "Invites a person to take a seat on an organisation's licence. No title.",
  admin_invite: "Invites the person who will run a customer organisation's account.",
  org_invoice_sent: "Owner and finance: a new invoice to pay, with the amount, due date and pay link.",
  org_payment_problem: "Owner and finance: a payment failed or an invoice is overdue, and until when access holds.",
  org_licence_suspended: "Owner and finance: billing paused access until the payment goes through.",
  org_licence_ending: "Owner and finance: the licence will not renew, and access lasts until the date shown.",
  org_licence_ended: "Owner and finance: the licence ended, with any cooling-off refund. Members keep their work.",
  org_terms_reminder: "Consumer organisers: price, how often, next payment and how to cancel, before renewals.",
};
