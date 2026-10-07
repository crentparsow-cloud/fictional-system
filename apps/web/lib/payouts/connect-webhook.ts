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
 * Logs carry ids only: event id, type, account id, organisation id.
 */

export type ConnectSyncResult = "applied" | "unchanged" | "stale" | "unlinked";

export interface ConnectRepo {
  /** public.sync_connect_status */
  syncStatus(accountId: string, status: "pending" | "verified" | "action_needed", observedAt: string): Promise<{ result: ConnectSyncResult; orgId: string | null }>;
  /** public.note_payout_details_changed. Returns the organisation id, or null when the account is not linked. */
  noteDetailsChanged(accountId: string, change: "created" | "updated" | "deleted", eventId: string): Promise<string | null>;
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

export type ConnectAction = "status_applied" | "status_unchanged" | "status_stale" | "account_unlinked" | "details_changed" | "ignored";

export interface ConnectOutcome {
  eventId: string;
  type: string;
  action: ConnectAction;
  accountId: string | null;
  orgId: string | null;
  notify?: PayoutDetailsNotice;
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
