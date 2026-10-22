/**
 * Who runs Akana, and how to reach them. One place, so a change here is a
 * change everywhere (footer, legal pages, emails). Values marked PLACEHOLDER
 * are not decided yet; the site shows them in square brackets until they are.
 */
import { supportContact } from "@/lib/help";

export const company = {
  legalName: "Akana Holdings",
  address: ["128 City Road", "London", "EC1V 2NX"],
  /** PLACEHOLDER until Akana Holdings is registered and the number is known. */
  registrationNumber: process.env.NEXT_PUBLIC_COMPANY_NUMBER?.trim() || "[company number]",
  /** How quickly we aim to reply. Proposed, to confirm before launch. */
  replyTime: "2 working days",
} as const;

export function companyLine(): string {
  return `${company.legalName}, ${company.address.join(", ")}`;
}

export function support() {
  return supportContact();
}

/**
 * Revenue share, approved as draft wording and printed on the Publish page
 * (it may change before launch). Not live: the live figures sit in
 * royalty_config and are set by staff in the console. See
 * claude/akana-revenue-share-proposal.md.
 */
export const proposedRevenueShare = {
  authorSale: 0.5,
  authorSaleOwnLink: 0.6,
  authorMembershipPool: 0.5,
  basis: "net receipts, after tax, payment fees and refunds",
} as const;
