"use server";

import { revalidatePath } from "next/cache";
import { dashAbilities, lookupErrorMessage, parseLookupInput, readLookup, type LookupResult } from "@/lib/account-lookup";
import { parseRefundForm } from "@/lib/money/refund";
import { performRefund, type RefundNotice } from "@/lib/money/refund-run";
import { getStaffSession } from "@/lib/staff";
import {
  cleanReason,
  isUuid,
  parseCancelDeletion,
  parseResend,
  parseRestore,
  readResendContext,
  supportAbilities,
  supportErrorMessage,
} from "@/lib/support-actions";
import { sendDeletionCancelled, sendResend } from "@/lib/support-mail";
import { createUserClient } from "@/lib/supabase/server";

export type LookupState =
  | { status: "idle"; attempt: number }
  | { status: "error"; attempt: number; message: string; field?: "email" | "reason"; email: string; reason: string }
  | { status: "done"; attempt: number; result: LookupResult; email: string; reason: string };

/**
 * Account lookup (F-087). A POST through a server action, so the email
 * address never sits in a URL, a browser history or a server log line.
 * public.staff_lookup_account (migration 0022) checks the role and the
 * reason, writes the audit row and returns no answers.
 */
export async function lookupAccount(prev: LookupState, fd: FormData): Promise<LookupState> {
  const attempt = prev.attempt + 1;
  const staff = await getStaffSession("/admin/lookup");
  const emailRaw = typeof fd.get("email") === "string" ? String(fd.get("email")) : "";
  const reasonRaw = typeof fd.get("reason") === "string" ? String(fd.get("reason")) : "";
  if (!dashAbilities(staff.roles).lookupAccounts) {
    return { status: "error", attempt, message: lookupErrorMessage("AKD01"), email: "", reason: "" };
  }
  const input = parseLookupInput(emailRaw, reasonRaw);
  if (!input.ok) return { status: "error", attempt, message: input.message, field: input.field, email: emailRaw.slice(0, 254), reason: reasonRaw.slice(0, 500) };

  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("staff_lookup_account", { p_email: input.email, p_reason: input.reason });
  if (error) {
    console.error("admin_lookup_failed", error.code ?? "");
    return { status: "error", attempt, message: lookupErrorMessage(error.code), email: input.email, reason: input.reason };
  }
  return { status: "done", attempt, result: readLookup(data), email: input.email, reason: input.reason };
}

// ---------------------------------------------------------------------------
// The four lookup actions (F-087). Each needs a reason, is audited in the
// database, and is limited to its roles there (0021 for refunds, 0027 for the
// rest). Server actions over POST, so nothing about the reader goes in a URL.
// ---------------------------------------------------------------------------

export type ActionState = { status: "idle" | "ok" | "error"; attempt: number; message: string };

const done = (prev: ActionState, ok: boolean, message: string): ActionState => ({ status: ok ? "ok" : "error", attempt: prev.attempt + 1, message });

const REFUND_TEXT: Record<RefundNotice, [boolean, string]> = {
  refunded: [true, "Refund made in Stripe and recorded in the ledger."],
  refunded_reclaimed: [true, "Refund made, and the author's share reclaimed from their last payout."],
  refunded_no_receipt: [true, "Refund made in Stripe. It had no ledger receipt, so check the reconciliation."],
  reclaim_failed: [true, "Refund made. Reclaiming from the payout failed, so it comes off the next statement."],
  refund_ledger: [false, "The refund went through in Stripe but the ledger did not record it yet. The webhook will record it."],
  refund_too_much: [false, "That is more than is left to refund on this payment."],
  refund_no_payment: [false, "This purchase has no Stripe payment to refund."],
  refund_stripe: [false, "Stripe refused the refund. Nothing was recorded."],
  refund_not_reader: [false, "That purchase is not this reader's. Look them up again."],
  invalid: [false, "That purchase could not be found."],
};

/** Refund a single workbook purchase from the lookup, through the shared refund path. */
export async function refundFromLookup(prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await getStaffSession("/admin/lookup");
  if (!supportAbilities(staff.roles).refund) return done(prev, false, "Refunds are made by owners and finance.");
  const userId = fd.get("user");
  const note = cleanReason(fd.get("note"));
  if (!isUuid(userId)) return done(prev, false, "Look the reader up again.");
  if (!note) return done(prev, false, "Give a reason of 5 to 500 characters, such as the ticket number.");
  const req = parseRefundForm((k) => (k === "target" ? "purchase" : k === "reclaim" ? null : fd.get(k)));
  if (!req) return done(prev, false, "Choose a reason, and give an amount above zero for a partial refund.");
  const supabase = await createUserClient();
  const { notice, refundId, emailed } = await performRefund(supabase, staff.userId, req, { note, expectUserId: userId.toLowerCase() });
  if (refundId) revalidatePath("/admin/money/refunds");
  const [ok, text] = REFUND_TEXT[notice];
  const mail = refundId ? (emailed ? " The reader has been emailed." : " The confirmation email did not send, so let the reader know.") : "";
  return done(prev, ok, text + mail);
}

/** Resend the purchase or membership email (0027 public.staff_resend_context). */
export async function resendEmail(prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await getStaffSession("/admin/lookup");
  if (!supportAbilities(staff.roles).resend) return done(prev, false, supportErrorMessage("AKX01"));
  const input = parseResend((k) => fd.get(k));
  if (!input.ok) return done(prev, false, input.message);
  const v = input.value;
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("staff_resend_context", { p_user: v.userId, p_kind: v.kind, p_ref: v.ref, p_reason: v.reason });
  if (error) {
    console.error("admin_lookup_resend_failed", error.code ?? "");
    return done(prev, false, supportErrorMessage(error.code));
  }
  const ctx = readResendContext(data);
  if (!ctx) return done(prev, false, "The email could not be prepared. Nothing was sent.");
  const sent = await sendResend(v.userId, ctx);
  if (sent === "sent" || sent === "sent_test") return done(prev, true, "Sent again. The resend is in the account's audit trail.");
  if (sent === "no_figures") return done(prev, false, "The price or date for this email is missing, so nothing was sent.");
  return done(prev, false, "The email did not send. The resend is still logged. Try again later.");
}

/** Restore access: re-activate a purchase or gift row, or give one workbook (0027 public.staff_restore_access). */
export async function restoreAccess(prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await getStaffSession("/admin/lookup");
  if (!supportAbilities(staff.roles).restore) return done(prev, false, supportErrorMessage("AKX01"));
  const input = parseRestore((k) => fd.get(k));
  if (!input.ok) return done(prev, false, input.message);
  const v = input.value;
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("staff_restore_access", {
    p_user: v.userId,
    p_entitlement: v.entitlementId,
    p_workbook_code: v.workbookCode,
    p_ends_at: v.endsAt,
    p_reason: v.reason,
  });
  if (error) {
    console.error("admin_lookup_restore_failed", error.code ?? "");
    return done(prev, false, supportErrorMessage(error.code));
  }
  return done(prev, true, v.workbookCode ? `Access to ${v.workbookCode} given. Look the reader up again to see it.` : "Access restored. Look the reader up again to see it.");
}

/** Cancel a pending deletion for the reader and email them (0027 public.staff_cancel_deletion). */
export async function cancelDeletionForReader(prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await getStaffSession("/admin/lookup");
  if (!supportAbilities(staff.roles).cancelDeletion) return done(prev, false, supportErrorMessage("AKX01"));
  const input = parseCancelDeletion((k) => fd.get(k));
  if (!input.ok) return done(prev, false, input.message);
  const v = input.value;
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("staff_cancel_deletion", { p_user: v.userId, p_reason: v.reason });
  if (error) {
    console.error("admin_lookup_cancel_deletion_failed", error.code ?? "");
    return done(prev, false, supportErrorMessage(error.code));
  }
  const j = (data ?? {}) as { email?: unknown; name?: unknown };
  const email = typeof j.email === "string" ? j.email : null;
  const sent = email ? await sendDeletionCancelled({ userId: v.userId, email, name: typeof j.name === "string" ? j.name : null }) : "no_address";
  const mailed = sent === "sent" || sent === "sent_test";
  return done(prev, true, mailed ? "Deletion cancelled. The reader has been emailed to confirm." : "Deletion cancelled. The confirmation email did not send, so let the reader know.");
}
