import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import type { SubscriptionState } from "@/lib/membership";
import { closeDuplicateSubscription, DUPLICATE_MARK, type DuplicateClosed, type StripeDuplicateApi } from "@/lib/duplicate-subscription";
import type { DisputeInfo, LedgerRepo } from "@/lib/money/ledger";
import {
  DISPUTE_ALERT_SOURCE,
  DUPLICATE_ALERT_SOURCE,
  DuplicateLiveSubscriptionError,
  handleStripeEvent,
  REFUND_FAILED_ALERT_SOURCE,
  type DisputeResult,
  type InvoiceRecord,
  type InvoiceRecordResult,
  type MembershipRepo,
  type MoneyRepo,
  type PurchaseRepo,
  type SubscriptionUpsertResult,
} from "@/lib/stripe-webhook";

/**
 * Review of 21 November 2026: a second live membership (M9), disputes (M10)
 * and failed refunds (L7). No network: the fakes behave like the SQL of
 * migration 0075 (one live subscription per reader, one row per dispute) and
 * like Stripe (a cancel ends the subscription, a refund is kept).
 */

const USER = "55555555-5555-4555-8555-555555555555";
const TENANT = "00000000-0000-0000-0000-00000000000a";
const LIVE = new Set(["trialing", "active", "past_due"]);

const noPurchases: PurchaseRepo = {
  findBySessionId: async () => null,
  findByPaymentIntentId: async () => null,
  grant: async () => undefined,
  revoke: async () => undefined,
  markFailed: async () => undefined,
};

function event(type: string, object: unknown, id = "evt_1", created = 1_800_000_000): Stripe.Event {
  return { id, object: "event", type, created, livemode: false, data: { object } } as unknown as Stripe.Event;
}

function subscription(id: string, over: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id,
    object: "subscription",
    status: "active",
    customer: "cus_1",
    metadata: { user_id: USER, tenant_id: TENANT },
    start_date: 1_799_000_000,
    trial_end: null,
    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
    ended_at: null,
    items: { data: [{ current_period_end: 1_802_000_000, price: { id: "price_m", unit_amount: 799, currency: "gbp", recurring: { interval: "month" } } }] },
    ...over,
  } as unknown as Stripe.Subscription;
}

/** Stripe and the database together, as far as a duplicate membership needs them. */
class World implements MembershipRepo {
  stripe = new Map<string, Stripe.Subscription>();
  rows = new Map<string, SubscriptionState>();
  invoices = new Map<string, InvoiceRecord>();
  cancels: string[] = [];
  refunds: string[] = [];
  unreadable = new Set<string>();

  async retrieveSubscription(id: string) {
    return this.unreadable.has(id) ? null : (this.stripe.get(id) ?? null);
  }
  /** As app.upsert_subscription under subscriptions_one_live_idx. */
  async upsertSubscription(s: SubscriptionState): Promise<SubscriptionUpsertResult> {
    const prev = this.rows.get(s.subscriptionId);
    if (prev && s.observedAt < prev.observedAt) return "stale";
    if (LIVE.has(s.status)) {
      const clash = [...this.rows.values()].some((r) => r.subscriptionId !== s.subscriptionId && r.userId === s.userId && r.tenantId === s.tenantId && LIVE.has(r.status));
      if (clash) throw new DuplicateLiveSubscriptionError();
    }
    const same = prev?.status === s.status;
    this.rows.set(s.subscriptionId, s);
    return same ? "unchanged" : "applied";
  }
  async syncMembership() {}
  async recordInvoice(r: InvoiceRecord): Promise<InvoiceRecordResult> {
    if (!this.rows.has(r.subscriptionId)) return "unlinked";
    if (this.invoices.has(r.invoiceId)) return "unchanged";
    this.invoices.set(r.invoiceId, r);
    return "recorded";
  }
  async otherLiveSubscriptions(s: SubscriptionState) {
    return [...this.rows.values()].filter((r) => r.userId === s.userId && r.tenantId === s.tenantId && LIVE.has(r.status)).map((r) => r.subscriptionId);
  }
  async closeDuplicate(id: string): Promise<DuplicateClosed> {
    const sub = this.stripe.get(id)!;
    let refund: DuplicateClosed["refund"] = "already_refunded";
    if (sub.status !== "canceled") {
      this.cancels.push(id);
      this.stripe.set(id, { ...sub, status: "canceled", canceled_at: 1_800_000_100, ended_at: 1_800_000_100, cancellation_details: { comment: DUPLICATE_MARK } } as Stripe.Subscription);
    }
    if (!this.refunds.includes(id)) {
      this.refunds.push(id);
      refund = "refunded";
    }
    return { subscription: this.stripe.get(id)!, refund };
  }
  live() {
    return [...this.rows.values()].filter((r) => LIVE.has(r.status)).map((r) => r.subscriptionId);
  }
}

describe("a second live membership for one reader (M9)", () => {
  it("cancels and refunds the second one, keeps the first, and does not throw", async () => {
    const w = new World();
    w.stripe.set("sub_a", subscription("sub_a"));
    w.stripe.set("sub_b", subscription("sub_b"));
    const first = await handleStripeEvent(event("customer.subscription.created", subscription("sub_a")), noPurchases, w);
    expect(first.action).toBe("subscription_applied");

    const second = await handleStripeEvent(event("customer.subscription.created", subscription("sub_b"), "evt_2"), noPurchases, w);
    expect(second.action).toBe("subscription_duplicate_closed");
    expect(second.alerts).toEqual([{ kind: "webhook_failure", source: DUPLICATE_ALERT_SOURCE, code: "duplicate_closed_and_refunded" }]);
    expect(w.cancels).toEqual(["sub_b"]);
    expect(w.refunds).toEqual(["sub_b"]);
    expect(w.live()).toEqual(["sub_a"]);
    expect(w.rows.get("sub_b")?.status).toBe("canceled");
  });

  it("is the same whichever subscription's event arrives first: one is kept, one is closed", async () => {
    const w = new World();
    w.stripe.set("sub_a", subscription("sub_a"));
    w.stripe.set("sub_b", subscription("sub_b"));
    await handleStripeEvent(event("customer.subscription.created", subscription("sub_b")), noPurchases, w);
    const out = await handleStripeEvent(event("customer.subscription.created", subscription("sub_a"), "evt_2"), noPurchases, w);
    expect(out.action).toBe("subscription_duplicate_closed");
    expect(w.live()).toEqual(["sub_b"]);
    expect(w.cancels).toEqual(["sub_a"]);
  });

  it("a repeat of any event cancels and refunds nothing more", async () => {
    const w = new World();
    w.stripe.set("sub_a", subscription("sub_a"));
    w.stripe.set("sub_b", subscription("sub_b"));
    await handleStripeEvent(event("customer.subscription.created", subscription("sub_a")), noPurchases, w);
    const dup = event("customer.subscription.updated", subscription("sub_b"), "evt_2");
    await handleStripeEvent(dup, noPurchases, w);
    const again = await handleStripeEvent(dup, noPurchases, w);
    // Read fresh, it is cancelled now: an ordinary update of a cancelled row.
    expect(["subscription_unchanged", "subscription_applied"]).toContain(again.action);
    expect(again.alerts).toBeUndefined();
    await handleStripeEvent(event("customer.subscription.deleted", w.stripe.get("sub_b") as never, "evt_3"), noPurchases, w);
    expect(w.cancels).toEqual(["sub_b"]);
    expect(w.refunds).toEqual(["sub_b"]);
    expect(w.live()).toEqual(["sub_a"]);
  });

  it("keeps the new membership when the old one had ended and its event was late", async () => {
    const w = new World();
    w.stripe.set("sub_old", subscription("sub_old"));
    await handleStripeEvent(event("customer.subscription.created", subscription("sub_old")), noPurchases, w);
    // The old one ends in Stripe, but customer.subscription.deleted has not arrived yet.
    w.stripe.set("sub_old", subscription("sub_old", { status: "canceled", canceled_at: 1_800_000_050, ended_at: 1_800_000_050 }));
    w.stripe.set("sub_new", subscription("sub_new"));
    const out = await handleStripeEvent(event("customer.subscription.created", subscription("sub_new"), "evt_2"), noPurchases, w);
    expect(out.action).toBe("subscription_applied");
    expect(out.alerts).toBeUndefined();
    expect(w.cancels).toEqual([]);
    expect(w.refunds).toEqual([]);
    expect(w.live()).toEqual(["sub_new"]);
    expect(w.rows.get("sub_old")?.status).toBe("canceled");
  });

  it("cancels nothing on a guess: when the other membership cannot be read, the event is retried", async () => {
    const w = new World();
    w.stripe.set("sub_a", subscription("sub_a"));
    w.stripe.set("sub_b", subscription("sub_b"));
    await handleStripeEvent(event("customer.subscription.created", subscription("sub_a")), noPurchases, w);
    w.unreadable.add("sub_a");
    await expect(handleStripeEvent(event("customer.subscription.created", subscription("sub_b"), "evt_2"), noPurchases, w)).rejects.toBeInstanceOf(DuplicateLiveSubscriptionError);
    expect(w.cancels).toEqual([]);
  });

  it("a payment on the duplicate is refunded and sends no welcome, even when invoice.paid comes after the cancel", async () => {
    const w = new World();
    w.stripe.set("sub_a", subscription("sub_a"));
    w.stripe.set("sub_b", subscription("sub_b"));
    await handleStripeEvent(event("customer.subscription.created", subscription("sub_a")), noPurchases, w);
    const invoice = { id: "in_b", currency: "gbp", amount_paid: 799, billing_reason: "subscription_create", customer_email: "r@example.test", parent: { subscription_details: { subscription: "sub_b" } } };
    // invoice.paid is the first event to arrive for the duplicate.
    const paid = await handleStripeEvent(event("invoice.paid", invoice, "evt_2"), noPurchases, w);
    expect(paid.mail).toBeUndefined();
    expect(paid.alerts?.[0]?.source).toBe(DUPLICATE_ALERT_SOURCE);
    expect(w.cancels).toEqual(["sub_b"]);
    expect(w.refunds).toEqual(["sub_b"]);
    // A later payment event on the closed duplicate asks for the refund again; Stripe keeps it to one.
    w.refunds.length = 0;
    const late = await handleStripeEvent(event("invoice.paid", { ...invoice, id: "in_b2" }, "evt_3"), noPurchases, w);
    expect(late.mail).toBeUndefined();
    expect(w.refunds).toEqual(["sub_b"]);
    expect(w.cancels).toEqual(["sub_b"]);
    expect(w.live()).toEqual(["sub_a"]);
  });

  it("without the duplicate methods the refusal still surfaces, as before", async () => {
    const w = new World();
    const bare: MembershipRepo = { upsertSubscription: (s) => w.upsertSubscription(s), syncMembership: async () => undefined, recordInvoice: (r) => w.recordInvoice(r) };
    await handleStripeEvent(event("customer.subscription.created", subscription("sub_a")), noPurchases, bare);
    await expect(handleStripeEvent(event("customer.subscription.created", subscription("sub_b"), "evt_2"), noPurchases, bare)).rejects.toBeInstanceOf(DuplicateLiveSubscriptionError);
  });
});

/** A fake of the Stripe calls closeDuplicateSubscription makes. */
function duplicateApi(sub: Stripe.Subscription, paid: number) {
  const calls: string[] = [];
  const refunds: { id: string; amount: number; status: string; metadata: Record<string, string> }[] = [];
  let current = sub;
  const api = {
    subscriptions: {
      retrieve: async () => current,
      cancel: async (_id: string, params: { cancellation_details?: { comment?: string } }) => {
        calls.push(`cancel:${params.cancellation_details?.comment}`);
        current = { ...current, status: "canceled", cancellation_details: params.cancellation_details } as Stripe.Subscription;
        return current;
      },
    },
    invoices: { list: async () => ({ data: paid > 0 ? [{ id: "in_1", amount_paid: paid }] : [] }) },
    invoicePayments: { list: async () => ({ data: [{ payment: { payment_intent: "pi_1" } }] }) },
    refunds: {
      list: async () => ({ data: refunds }),
      create: async (params: { amount: number; metadata: Record<string, string> }, options: { idempotencyKey: string }) => {
        calls.push(`refund:${params.amount}:${options.idempotencyKey}`);
        refunds.push({ id: "re_1", amount: params.amount, status: "pending", metadata: params.metadata });
        return refunds[0];
      },
    },
  } as unknown as StripeDuplicateApi;
  return { api, calls, refunds };
}

describe("closeDuplicateSubscription", () => {
  it("cancels with the mark and refunds the latest payment in full, once", async () => {
    const { api, calls } = duplicateApi(subscription("sub_b"), 799);
    const first = await closeDuplicateSubscription(api, "sub_b");
    expect(first.refund).toBe("refunded");
    expect(first.subscription.status).toBe("canceled");
    expect(calls).toEqual([`cancel:${DUPLICATE_MARK}`, "refund:799:akana-duplicate-refund-in_1"]);
    const second = await closeDuplicateSubscription(api, "sub_b");
    expect(second.refund).toBe("already_refunded");
    expect(calls).toHaveLength(2);
  });

  it("refunds only what is left when part was refunded already, and nothing for a trial", async () => {
    const part = duplicateApi(subscription("sub_b"), 799);
    part.refunds.push({ id: "re_0", amount: 300, status: "succeeded", metadata: {} });
    await closeDuplicateSubscription(part.api, "sub_b");
    expect(part.calls[1]).toBe("refund:499:akana-duplicate-refund-in_1");

    const trial = duplicateApi(subscription("sub_t", { status: "trialing" }), 0);
    const out = await closeDuplicateSubscription(trial.api, "sub_t");
    expect(out.refund).toBe("nothing_paid");
    expect(trial.calls).toEqual([`cancel:${DUPLICATE_MARK}`]);
  });
});

/** As public.dispute_open and public.dispute_close (0075): one row per dispute, a repeat changes nothing. */
class FakeMoney implements MoneyRepo {
  disputes = new Map<string, DisputeResult>();
  suspended = new Set<string>();
  ended: string[] = [];
  restored: string[] = [];
  refunded = 0;
  refundedPurchase = true;
  constructor(private payments: Record<string, { kind: "workbook" | "membership"; sub?: string }>) {}
  async openDispute(id: string, pi: string) {
    const known = this.disputes.get(id);
    if (known && known.kind !== "unmatched") return { ...known, changed: false };
    const p = this.payments[pi];
    if (!p) {
      const r: DisputeResult = { kind: "unmatched", status: "open", changed: false, subscriptionId: null };
      this.disputes.set(id, r);
      return r;
    }
    this.suspended.add(pi);
    const r: DisputeResult = { kind: p.kind, status: "open", changed: true, subscriptionId: p.sub ?? null };
    this.disputes.set(id, r);
    return r;
  }
  async closeDispute(id: string, pi: string, outcome: "won" | "lost") {
    await this.openDispute(id, pi);
    const d = this.disputes.get(id)!;
    if (d.status !== "open") return { ...d, changed: false };
    if (outcome === "won") this.suspended.delete(pi);
    const r: DisputeResult = { ...d, status: outcome, changed: d.kind !== "unmatched" };
    this.disputes.set(id, r);
    return r;
  }
  async endMembership(sub: string) {
    if (!this.ended.includes(sub)) this.ended.push(sub);
  }
  async refundedMinor() {
    return this.refunded;
  }
  async restoreAfterFailedRefund(pi: string, _refund: string, still: number) {
    if (!this.payments[pi] || this.payments[pi]!.kind !== "workbook") return "none" as const;
    if (!this.refundedPurchase) return "unchanged" as const;
    if (still >= 1200) return "still_refunded" as const;
    this.refundedPurchase = false;
    this.restored.push(pi);
    return "restored" as const;
  }
}

class FakeLedger implements LedgerRepo {
  disputes: { kind: string; d: DisputeInfo }[] = [];
  refunds: string[] = [];
  async recordSale() {
    return "recorded";
  }
  async recordMembership() {
    return "recorded";
  }
  async syncRefunds(pi: string) {
    this.refunds.push(pi);
  }
  async recordDispute(kind: "dispute" | "dispute_reversal", d: DisputeInfo) {
    this.disputes.push({ kind, d });
    return "recorded";
  }
}

const dispute = (over: Record<string, unknown> = {}) => ({ id: "du_1", object: "dispute", amount: 1200, currency: "gbp", payment_intent: "pi_w", created: 1_700_000_000, status: "needs_response", ...over });

describe("disputes suspend access, a win restores it, and staff are told (M10)", () => {
  it("a dispute on a workbook payment suspends it and alerts; a win gives it back", async () => {
    const money = new FakeMoney({ pi_w: { kind: "workbook" } });
    const ledger = new FakeLedger();
    const opened = await handleStripeEvent(event("charge.dispute.created", dispute()), noPurchases, undefined, ledger, money);
    expect(opened.action).toBe("dispute_recorded");
    expect(opened.alerts).toEqual([{ kind: "webhook_failure", source: DISPUTE_ALERT_SOURCE, code: "dispute_opened_workbook" }]);
    expect(money.suspended.has("pi_w")).toBe(true);

    const won = await handleStripeEvent(event("charge.dispute.closed", dispute({ status: "won" }), "evt_2"), noPurchases, undefined, ledger, money);
    expect(won.alerts?.[0]?.code).toBe("dispute_won_workbook");
    expect(money.suspended.has("pi_w")).toBe(false);
    expect(ledger.disputes.map((x) => x.kind)).toEqual(["dispute", "dispute_reversal"]);
  });

  it("a lost dispute on a membership payment keeps access closed and ends the membership in Stripe", async () => {
    const money = new FakeMoney({ pi_m: { kind: "membership", sub: "sub_m" } });
    const ledger = new FakeLedger();
    await handleStripeEvent(event("charge.dispute.created", dispute({ payment_intent: "pi_m" })), noPurchases, undefined, ledger, money);
    const lost = await handleStripeEvent(event("charge.dispute.closed", dispute({ payment_intent: "pi_m", status: "lost" }), "evt_2"), noPurchases, undefined, ledger, money);
    expect(lost.action).toBe("dispute_lost");
    expect(lost.subscriptionId).toBe("sub_m");
    expect(lost.alerts?.[0]?.code).toBe("dispute_lost_membership");
    expect(money.suspended.has("pi_m")).toBe(true);
    expect(money.ended).toEqual(["sub_m"]);
    // The author's share stays reversed: no reversal line for a loss.
    expect(ledger.disputes.map((x) => x.kind)).toEqual(["dispute"]);
  });

  it("twice, and out of order, ends in the same place", async () => {
    const money = new FakeMoney({ pi_w: { kind: "workbook" } });
    const ledger = new FakeLedger();
    // The close arrives before the open.
    await handleStripeEvent(event("charge.dispute.closed", dispute({ status: "lost" }), "evt_2"), noPurchases, undefined, ledger, money);
    expect(money.suspended.has("pi_w")).toBe(true);
    await handleStripeEvent(event("charge.dispute.created", dispute()), noPurchases, undefined, ledger, money);
    await handleStripeEvent(event("charge.dispute.created", dispute()), noPurchases, undefined, ledger, money);
    await handleStripeEvent(event("charge.dispute.closed", dispute({ status: "lost" }), "evt_2"), noPurchases, undefined, ledger, money);
    expect(money.disputes.get("du_1")?.status).toBe("lost");
    expect(money.suspended.has("pi_w")).toBe(true);
  });

  it("an enquiry that closes with no chargeback gives access back", async () => {
    const money = new FakeMoney({ pi_w: { kind: "workbook" } });
    await handleStripeEvent(event("charge.dispute.created", dispute({ status: "warning_needs_response" })), noPurchases, undefined, undefined, money);
    await handleStripeEvent(event("charge.dispute.closed", dispute({ status: "warning_closed" }), "evt_2"), noPurchases, undefined, undefined, money);
    expect(money.suspended.size).toBe(0);
  });

  it("a dispute on a payment we cannot match still alerts", async () => {
    const money = new FakeMoney({});
    const out = await handleStripeEvent(event("charge.dispute.created", dispute({ payment_intent: "pi_other" })), noPurchases, undefined, undefined, money);
    expect(out.alerts?.[0]?.code).toBe("dispute_opened_unmatched");
  });
});

describe("a failed refund (L7)", () => {
  const refund = (over: Record<string, unknown> = {}) => ({ id: "re_1", object: "refund", status: "failed", payment_intent: "pi_w", amount: 1200, ...over });

  it("reopens the workbook the refund closed and alerts staff, from either event", async () => {
    for (const type of ["refund.failed", "charge.refund.updated"]) {
      const money = new FakeMoney({ pi_w: { kind: "workbook" } });
      const ledger = new FakeLedger();
      const out = await handleStripeEvent(event(type, refund()), noPurchases, undefined, ledger, money);
      expect(out.action).toBe("refund_failed_restored");
      expect(out.alerts).toEqual([{ kind: "webhook_failure", source: REFUND_FAILED_ALERT_SOURCE, code: "refund_failed_restored" }]);
      expect(money.restored).toEqual(["pi_w"]);
      // The second delivery restores nothing more, and still flags it.
      const again = await handleStripeEvent(event(type, refund()), noPurchases, undefined, ledger, money);
      expect(again.action).toBe("refund_failed_flagged");
      expect(money.restored).toEqual(["pi_w"]);
    }
  });

  it("leaves access closed when another refund still covers the price", async () => {
    const money = new FakeMoney({ pi_w: { kind: "workbook" } });
    money.refunded = 1200;
    const out = await handleStripeEvent(event("refund.failed", refund()), noPurchases, undefined, undefined, money);
    expect(out.action).toBe("refund_failed_flagged");
    expect(out.alerts?.[0]?.code).toBe("refund_failed_still_refunded");
    expect(money.restored).toEqual([]);
  });

  it("flags a failed membership refund, where there is nothing to reopen", async () => {
    const money = new FakeMoney({ pi_m: { kind: "membership", sub: "sub_m" } });
    const out = await handleStripeEvent(event("refund.failed", refund({ payment_intent: "pi_m" })), noPurchases, undefined, undefined, money);
    expect(out.action).toBe("refund_failed_flagged");
    expect(out.alerts?.[0]?.code).toBe("refund_failed_none");
  });

  it("ignores a refund update that is not a failure, and every new event type without the money repo", async () => {
    const money = new FakeMoney({ pi_w: { kind: "workbook" } });
    const ok = await handleStripeEvent(event("charge.refund.updated", refund({ status: "succeeded" })), noPurchases, undefined, undefined, money);
    expect(ok.action).toBe("ignored");
    expect(ok.alerts).toBeUndefined();
    for (const type of ["refund.failed", "charge.refund.updated", "charge.dispute.created", "charge.dispute.closed"]) {
      const out = await handleStripeEvent(event(type, type.startsWith("charge.dispute") ? dispute() : refund()), noPurchases);
      expect(out.action).toBe("ignored");
    }
  });
});
