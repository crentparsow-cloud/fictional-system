import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { handleConnectEvent, isConnectEvent, type ConnectRepo } from "@/lib/payouts/connect-webhook";

class FakeRepo implements ConnectRepo {
  synced: { accountId: string; status: string; observedAt: string }[] = [];
  noted: { accountId: string; change: string; eventId: string }[] = [];
  linked = new Map<string, string>([["acct_1", "org-1"]]);
  fresh: Stripe.Account | null = null;
  async syncStatus(accountId: string, status: "pending" | "verified" | "action_needed", observedAt: string) {
    this.synced.push({ accountId, status, observedAt });
    const orgId = this.linked.get(accountId) ?? null;
    return { result: orgId ? ("applied" as const) : ("unlinked" as const), orgId };
  }
  async noteDetailsChanged(accountId: string, change: "created" | "updated" | "deleted", eventId: string) {
    this.noted.push({ accountId, change, eventId });
    return this.linked.get(accountId) ?? null;
  }
  async retrieveAccount() {
    return this.fresh;
  }
  failed = new Map<string, { code: string | null; amountMinor: number | null }>();
  /** As public.note_connect_payout_failed: once per Stripe payout. */
  async notePayoutFailed(a: { accountId: string; payoutId: string; code: string | null; amountMinor: number | null }) {
    const orgId = this.linked.get(a.accountId) ?? null;
    if (!orgId) return { orgId: null, recorded: false };
    if (this.failed.has(a.payoutId)) return { orgId, recorded: false };
    this.failed.set(a.payoutId, { code: a.code, amountMinor: a.amountMinor });
    return { orgId, recorded: true };
  }
}

const account = (o: Partial<Stripe.Account>): Stripe.Account =>
  ({ id: "acct_1", object: "account", details_submitted: true, payouts_enabled: false, capabilities: {}, requirements: { past_due: [], disabled_reason: null }, ...o }) as unknown as Stripe.Account;

const event = (type: string, object: unknown, acct: string | undefined = "acct_1"): Stripe.Event =>
  ({ id: `evt_${type}`, object: "event", type, account: acct, created: 1_800_000_000, data: { object } }) as unknown as Stripe.Event;

describe("isConnectEvent", () => {
  it("is true only for events on a connected account", () => {
    expect(isConnectEvent({ account: "acct_1", type: "account.updated" })).toBe(true);
    expect(isConnectEvent({ account: undefined, type: "checkout.session.completed" })).toBe(false);
  });
});

describe("account.updated", () => {
  it("syncs the status from the event when Stripe cannot be read", async () => {
    const repo = new FakeRepo();
    const out = await handleConnectEvent(event("account.updated", account({})), repo);
    expect(out.action).toBe("status_applied");
    expect(repo.synced[0]).toMatchObject({ accountId: "acct_1", status: "pending", observedAt: new Date(1_800_000_000_000).toISOString() });
    expect(out.notify).toBeUndefined();
  });
  it("prefers the fresh account", async () => {
    const repo = new FakeRepo();
    repo.fresh = account({ payouts_enabled: true, capabilities: { transfers: "active" } as Stripe.Account.Capabilities });
    await handleConnectEvent(event("account.updated", account({ details_submitted: false })), repo);
    expect(repo.synced[0]?.status).toBe("verified");
  });
  it("reports an unknown account", async () => {
    const repo = new FakeRepo();
    const out = await handleConnectEvent(event("account.updated", account({ id: "acct_9" }), "acct_9"), repo);
    expect(out.action).toBe("account_unlinked");
  });
});

describe("payout bank changes", () => {
  it("records the change and asks for the email once per event", async () => {
    const repo = new FakeRepo();
    const out = await handleConnectEvent(event("account.external_account.updated", { id: "ba_1" }), repo);
    expect(out.action).toBe("details_changed");
    expect(repo.noted[0]).toEqual({ accountId: "acct_1", change: "updated", eventId: "evt_account.external_account.updated" });
    expect(out.notify).toEqual({ template: "payout_details_changed", orgId: "org-1", change: "updated", dedupeKey: "payout_details_changed:evt_account.external_account.updated" });
  });
  it("sends nothing for an account that is not linked", async () => {
    const repo = new FakeRepo();
    const out = await handleConnectEvent(event("account.external_account.created", { id: "ba_1" }, "acct_x"), repo);
    expect(out.notify).toBeUndefined();
  });
  it("ignores other events", async () => {
    const out = await handleConnectEvent(event("payout.paid", { id: "po_1" }), new FakeRepo());
    expect(out.action).toBe("ignored");
  });
});

describe("a failed bank payout (L7)", () => {
  const payout = { id: "po_1", object: "payout", amount: 4200, currency: "gbp", failure_code: "account_closed", status: "failed" };

  it("records it once and asks for a payout_failure alert", async () => {
    const repo = new FakeRepo();
    const out = await handleConnectEvent(event("payout.failed", payout), repo);
    expect(out).toMatchObject({ action: "payout_failed", orgId: "org-1", alertCode: "bank_account_closed" });
    expect(repo.failed.get("po_1")).toEqual({ code: "account_closed", amountMinor: 4200 });
    // Delivered again: nothing new is recorded.
    const again = await handleConnectEvent(event("payout.failed", payout), repo);
    expect(again.action).toBe("payout_failed_already");
    expect(repo.failed.size).toBe(1);
  });

  it("never passes on a failure code that is not a short token", async () => {
    const repo = new FakeRepo();
    const out = await handleConnectEvent(event("payout.failed", { ...payout, failure_code: "Sort code 12-34-56 rejected" }), repo);
    expect(out.alertCode).toBe("bank_unknown");
    expect(repo.failed.get("po_1")?.code).toBeNull();
  });

  it("does nothing for an account that is not linked, or a repo that cannot record it", async () => {
    const out = await handleConnectEvent(event("payout.failed", payout, "acct_other"), new FakeRepo());
    expect(out).toMatchObject({ action: "account_unlinked", orgId: null });
    expect(out.alertCode).toBeUndefined();
    const bare = new FakeRepo();
    (bare as { notePayoutFailed?: unknown }).notePayoutFailed = undefined;
    expect((await handleConnectEvent(event("payout.failed", payout), bare)).action).toBe("ignored");
  });
});
