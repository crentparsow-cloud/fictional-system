import type Stripe from "stripe";
import { connectStatusFromAccount } from "@/lib/payouts/status";

/**
 * Connect webhook events (F-099, F-143), as a pure function over a small
 * repository so it can be tested with a fake and no network. The platform
 * webhook route verifies the signature (platform or Connect secret) and
 * hands any event that carries an `account` to handleConnectEvent.
 *
 * account.updated: the account is read fresh from Stripe when it can be, so
 * delivery order does not matter, and its status is written through
 * public.sync_connect_status, which ignores older observations and never
 * lifts a hold.
 *
 * account.external_account.created, .updated and .deleted: the bank account
 * or card that payouts go to changed in Stripe. That is audited through
 * public.note_payout_details_changed and the route emails the owner and
 * finance contacts, once per event.
 *
 * payout.failed (review L7, migration 0075): Stripe could not pay the
 * author's bank. public.note_connect_payout_failed records it once per
 * Stripe payout, stamps the organisation's latest payout and holds further
 * payouts until staff release the hold. The route raises a payout_failure
 * alert. The Connect endpoint must be sent payout.failed; until it is, the
 * event never arrives and nothing changes.
 *
 * Logs carry ids only: event id, type, account id, organisation id.
 */

export type ConnectSyncResult = "applied" | "unchanged" | "stale" | "unlinked";

export interface ConnectRepo {
  /** public.sync_connect_status */
  syncStatus(accountId: string, status: "pending" | "verified" | "action_needed", observedAt: string): Promise<{ result: ConnectSyncResult; orgId: string | null }>;
  /** public.note_payout_details_changed. Returns the organisation id, or null when the account is not linked. */
  noteDetailsChanged(accountId: string, change: "created" | "updated" | "deleted", eventId: string): Promise<string | null>;
  /** public.note_connect_payout_failed. Optional: without it payout.failed is ignored. */
  notePayoutFailed?(a: { accountId: string; payoutId: string; code: string | null; amountMinor: number | null; currency: string | null; livemode: boolean }): Promise<{ orgId: string | null; recorded: boolean }>;
  /** The account as Stripe has it now, or null when it cannot be read. Optional. */
  retrieveAccount?(accountId: string): Promise<Stripe.Account | null>;
}

export interface PayoutDetailsNotice {
  template: "payout_details_changed";
  orgId: string;
  change: "created" | "updated" | "deleted";
  /** payout_details_changed:<event id> */
  dedupeKey: string;
}

export type ConnectAction =
  | "status_applied"
  | "status_unchanged"
  | "status_stale"
  | "account_unlinked"
  | "details_changed"
  | "payout_failed"
  | "payout_failed_already"
  | "ignored";

export interface ConnectOutcome {
  eventId: string;
  type: string;
  action: ConnectAction;
  accountId: string | null;
  orgId: string | null;
  notify?: PayoutDetailsNotice;
  /** Set when the route should raise a payout_failure alert. A short code, never bank details. */
  alertCode?: string;
}

/** True when the route should send this event here rather than to the platform handler. */
export function isConnectEvent(event: Pick<Stripe.Event, "account" | "type">): boolean {
  return typeof event.account === "string" && event.account.startsWith("acct_");
}

const EXTERNAL: Record<string, "created" | "updated" | "deleted"> = {
  "account.external_account.created": "created",
  "account.external_account.updated": "updated",
  "account.external_account.deleted": "deleted",
};

export async function handleConnectEvent(event: Stripe.Event, repo: ConnectRepo): Promise<ConnectOutcome> {
  const accountId = typeof event.account === "string" ? event.account : null;
  const base = { eventId: event.id, type: event.type, accountId };

  if (event.type === "account.updated") {
    const fromEvent = event.data.object as Stripe.Account;
    const id = accountId ?? fromEvent.id;
    let account: Stripe.Account = fromEvent;
    let observedAt = new Date(event.created * 1000).toISOString();
    if (repo.retrieveAccount) {
      const fresh = await repo.retrieveAccount(id);
      if (fresh) {
        account = fresh;
        observedAt = new Date().toISOString();
      }
    }
    const { result, orgId } = await repo.syncStatus(id, connectStatusFromAccount(account), observedAt);
    const action: ConnectAction =
      result === "applied" ? "status_applied" : result === "unchanged" ? "status_unchanged" : result === "stale" ? "status_stale" : "account_unlinked";
    return { ...base, accountId: id, action, orgId };
  }

  if (event.type === "payout.failed") {
    const payout = event.data.object as Stripe.Payout;
    if (!accountId || !repo.notePayoutFailed || typeof payout?.id !== "string") return { ...base, action: "ignored", orgId: null };
    const code = typeof payout.failure_code === "string" && /^[a-z0-9_]{1,60}$/.test(payout.failure_code) ? payout.failure_code : null;
    const { orgId, recorded } = await repo.notePayoutFailed({
      accountId,
      payoutId: payout.id,
      code,
      amountMinor: typeof payout.amount === "number" ? payout.amount : null,
      currency: payout.currency ?? null,
      livemode: event.livemode,
    });
    if (!orgId) return { ...base, action: "account_unlinked", orgId: null };
    // Alerted on a repeat too: the alert is one row until staff acknowledge it.
    return { ...base, action: recorded ? "payout_failed" : "payout_failed_already", orgId, alertCode: `bank_${code ?? "unknown"}` };
  }

  const change = EXTERNAL[event.type];
  if (change && accountId) {
    const orgId = await repo.noteDetailsChanged(accountId, change, event.id);
    if (!orgId) return { ...base, action: "account_unlinked", orgId: null };
    return {
      ...base,
      action: "details_changed",
      orgId,
      notify: { template: "payout_details_changed", orgId, change, dedupeKey: `payout_details_changed:${event.id}` },
    };
  }

  return { ...base, action: "ignored", orgId: null };
}
