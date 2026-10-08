"use client";

import { useActionState, type ReactNode } from "react";
import { canRestoreRow, type LookupResult } from "@/lib/account-lookup";
import { REFUND_REASONS } from "@/lib/money/refund";
import type { SupportAbilities } from "@/lib/support-actions";
import { cancelDeletionForReader, refundFromLookup, resendEmail, restoreAccess, type ActionState } from "./actions";

const INITIAL: ActionState = { status: "idle", attempt: 0, message: "" };

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * One action form with its own result line. Each form carries the reader's
 * account id and a reason; the database checks the role, the reason and that
 * the record belongs to this reader, and writes the audit row.
 */
function ActionForm({
  action,
  label,
  busy,
  userId,
  id,
  reasonName = "reason",
  children,
}: {
  action: Action;
  label: string;
  busy: string;
  userId: string;
  id: string;
  reasonName?: string;
  children: ReactNode;
}) {
  const [state, run, pending] = useActionState(action, INITIAL);
  return (
    <form action={run} className="admin-form lookup-action-form" autoComplete="off">
      <input type="hidden" name="user" value={userId} />
      {children}
      <label htmlFor={`${id}-reason`}>Reason</label>
      <input id={`${id}-reason`} name={reasonName} type="text" minLength={5} maxLength={500} required placeholder="Ticket number and a few words" />
      <button type="submit" className="btn" disabled={pending}>
        {pending ? busy : label}
      </button>
      {state.status !== "idle" ? (
        <p key={state.attempt} className={`admin-notice admin-notice-${state.status === "ok" ? "ok" : "error"}`} role={state.status === "ok" ? "status" : "alert"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function Panel({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="lookup-action">
      <summary>{summary}</summary>
      {children}
    </details>
  );
}

/** Refund and resend for one purchase row. */
export function PurchaseActions({ userId, purchase, can }: { userId: string; purchase: LookupResult["purchases"][number]; can: SupportAbilities }) {
  if (purchase.kind !== "workbook" || purchase.status !== "paid") return null;
  return (
    <div className="lookup-actions">
      {can.refund ? (
        <Panel summary="Refund">
          <ActionForm action={refundFromLookup} label="Refund in Stripe" busy="Refunding" userId={userId} id={`rf-${purchase.id}`} reasonName="note">
            <input type="hidden" name="target_id" value={purchase.id} />
            <label htmlFor={`rf-${purchase.id}-why`}>Refund reason</label>
            <select id={`rf-${purchase.id}-why`} name="reason" required defaultValue="">
              <option value="" disabled>
                Choose a reason
              </option>
              {Object.entries(REFUND_REASONS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <fieldset className="lookup-radios">
              <legend>How much</legend>
              <label className="check">
                <input type="radio" name="scope" value="full" defaultChecked /> All that is left. Access ends.
              </label>
              <label className="check">
                <input type="radio" name="scope" value="partial" /> Part of it. Access stays.
              </label>
            </fieldset>
            <label htmlFor={`rf-${purchase.id}-amt`}>Amount for a part refund, in {purchase.currency}</label>
            <input id={`rf-${purchase.id}-amt`} name="amount" type="text" inputMode="decimal" maxLength={12} />
            <p className="muted small">The reader gets a refund email that names no title. The author&rsquo;s share is reversed in the ledger.</p>
          </ActionForm>
        </Panel>
      ) : (
        <p className="muted small">
          Refunds are made by owners and finance in{" "}
          <a href={`/admin/money/refunds?q=${encodeURIComponent(purchase.id)}`}>Money, Refunds</a>.
        </p>
      )}
      {can.resend ? (
        <Panel summary="Resend the purchase email">
          <ActionForm action={resendEmail} label="Resend" busy="Sending" userId={userId} id={`rs-${purchase.id}`}>
            <input type="hidden" name="kind" value="purchase" />
            <input type="hidden" name="ref" value={purchase.id} />
            <p className="muted small">Sends the purchase confirmation again to the reader&rsquo;s sign-in address. Five resends a day per reader.</p>
          </ActionForm>
        </Panel>
      ) : null}
    </div>
  );
}

/** Resend for a current membership. */
export function MembershipActions({ userId, sub, can }: { userId: string; sub: LookupResult["subscriptions"][number]; can: SupportAbilities }) {
  if (!can.resend || !sub.subscriptionId || !["active", "trialing", "past_due"].includes(sub.status)) return null;
  return (
    <Panel summary="Resend the membership email">
      <ActionForm action={resendEmail} label="Resend" busy="Sending" userId={userId} id={`rm-${sub.subscriptionId}`}>
        <input type="hidden" name="kind" value="membership" />
        <input type="hidden" name="ref" value={sub.subscriptionId} />
        <p className="muted small">Sends the membership terms again: price, how often, next payment and how to cancel.</p>
      </ActionForm>
    </Panel>
  );
}

/** Restore one access row. */
export function RestoreRow({ userId, row, can }: { userId: string; row: LookupResult["entitlements"][number]; can: SupportAbilities }) {
  if (!can.restore || !canRestoreRow(row)) {
    return row.takenDown ? <span className="muted small">Taken down</span> : null;
  }
  return (
    <Panel summary="Restore">
      <ActionForm action={restoreAccess} label="Restore access" busy="Restoring" userId={userId} id={`ra-${row.id}`}>
        <input type="hidden" name="entitlement" value={row.id ?? ""} />
        <p className="muted small">{row.source === "purchase" ? "Lifetime access comes back, even if the purchase was refunded. That is noted in the audit row." : "The gift comes back with no end date."}</p>
      </ActionForm>
    </Panel>
  );
}

/** Give access to one workbook by its code. */
export function GiveAccess({ userId, can }: { userId: string; can: SupportAbilities }) {
  if (!can.restore) return null;
  return (
    <Panel summary="Give access to one workbook">
      <ActionForm action={restoreAccess} label="Give access" busy="Saving" userId={userId} id="ga">
        <label htmlFor="ga-code">Workbook code</label>
        <input id="ga-code" name="workbook_code" type="text" required maxLength={8} pattern="[Aa][Kk]-[0-9A-Za-z]{5}" placeholder="AK-7Q2M9" />
        <label htmlFor="ga-ends">Ends on (optional)</label>
        <input id="ga-ends" name="ends_on" type="date" />
        <p className="muted small">For a reader who paid and did not get access, or a goodwill gesture. Live or paused titles only, never one that is taken down.</p>
      </ActionForm>
    </Panel>
  );
}

/** Cancel a pending deletion inside the undo window. */
export function CancelDeletion({ userId, can }: { userId: string; can: SupportAbilities }) {
  if (!can.cancelDeletion) return <p className="muted small">Owners and support can cancel a deletion for the reader.</p>;
  return (
    <Panel summary="Cancel the deletion for the reader">
      <ActionForm action={cancelDeletionForReader} label="Cancel the deletion" busy="Cancelling" userId={userId} id="cd">
        <label className="check">
          <input type="checkbox" name="confirm" value="yes" required /> The reader asked us to stop the deletion, and we checked it was them.
        </label>
        <p className="muted small">The reader gets an email to confirm, with a line on what to do if they did not ask.</p>
      </ActionForm>
    </Panel>
  );
}
