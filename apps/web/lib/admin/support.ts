/**
 * Support inbox helpers for /admin/support and the contact form (F-090).
 * Pure.
 */

export const SUPPORT_TOPICS = ["refund", "access", "deletion", "payout", "worried", "other"] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

export const SUPPORT_TOPIC_LABELS: Record<SupportTopic, string> = {
  refund: "A refund",
  access: "Getting into my account or a workbook",
  deletion: "Deleting my account or my answers",
  payout: "An author payment",
  worried: "I am worried about someone",
  other: "Something else",
};

export const SUPPORT_STATUSES = ["new", "open", "closed"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  new: "New",
  open: "Open",
  closed: "Closed",
};

export function isSupportStatus(v: unknown): v is SupportStatus {
  return typeof v === "string" && (SUPPORT_STATUSES as readonly string[]).includes(v);
}

export function isSupportTopic(v: unknown): v is SupportTopic {
  return typeof v === "string" && (SUPPORT_TOPICS as readonly string[]).includes(v);
}

export function parseSupportFilter(raw: string | string[] | undefined): SupportStatus | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return isSupportStatus(v) ? v : null;
}

/**
 * Saved replies, for staff to copy into the team inbox. Drafts for Crent to
 * approve. They never ask for or quote a reader's answers.
 */
export const SAVED_REPLIES: Record<SupportTopic, { title: string; body: string }> = {
  refund: {
    title: "Refunds",
    body:
      "Thank you for getting in touch. I am sorry it did not work out. Please reply with the email address you used to pay and the date of the payment. " +
      "We will check it against our refund policy and reply within [support response time]. You do not need to tell us anything you wrote in a workbook.",
  },
  access: {
    title: "Access",
    body:
      "Thank you for getting in touch. Please try signing in with the link we email you, using the same address you used to buy. " +
      "If the link does not arrive, check your spam folder. If it still does not work, reply to this email and tell us which address you used.",
  },
  deletion: {
    title: "Deletion",
    body:
      "Thank you for getting in touch. You can delete your account and your answers yourself from the You page, under your account settings. " +
      "Deletion finishes after 7 days, and you can undo it until then. If you would like us to do it for you, reply from the address on the account.",
  },
  payout: {
    title: "Payouts",
    body:
      "Thank you for getting in touch. Payments go out monthly with a statement. Please reply with your author code and the month you are asking about, " +
      "and we will check it and reply within [support response time].",
  },
  worried: {
    title: "I am worried about someone",
    body:
      "Thank you for telling us. We are not a crisis service and cannot check on anyone. If someone is in danger now, call 999 in the UK, or your local emergency number. " +
      "Our Help now page lists free support lines by country, with their opening hours: [Help now link].",
  },
  other: {
    title: "General",
    body: "Thank you for getting in touch. We have your message and will reply within [support response time].",
  },
};
