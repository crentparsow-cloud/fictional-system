import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import {
  DELETED_FLAG,
  errorCode,
  runDeletionJob,
  stripeCanceller,
  stripeSettlement,
  type DeletionJobDeps,
  type StripeSubscriptionsApi,
} from "@/lib/account-complete";
import { FakeStripeBilling } from "@/lib/testing/fake-stripe-billing";

/**
 * The deletion job (F-025) with a live membership (F-097). A fake Stripe
 * client and fake database calls; no network.
 */

type Sub = { id: string; status: string };

class FakeStripeSubscriptions {
  subs = new Map<string, Sub>();
  cancelled: string[] = [];
  failOn = new Set<string>();

  api(): StripeSubscriptionsApi {
    return {
      cancel: (async (id: string) => {
        if (this.failOn.has(id)) throw Object.assign(new Error("api_connection_error"), { type: "StripeConnectionError" });
        const s = this.subs.get(id);
        if (!s) throw Object.assign(new Error("No such subscription"), { code: "resource_missing", statusCode: 404 });
        if (s.status === "canceled") throw Object.assign(new Error("already canceled"), { code: "subscription_canceled", statusCode: 400 });
        s.status = "canceled";
        this.cancelled.push(id);
        return { ...s } as unknown as Stripe.Response<Stripe.Subscription>;
      }) as unknown as StripeSubscriptionsApi["cancel"],
      retrieve: (async (id: string) => {
        if (this.failOn.has(id)) throw new Error("api_connection_error");
        const s = this.subs.get(id);
        if (!s) throw Object.assign(new Error("No such subscription"), { code: "resource_missing", statusCode: 404 });
        return { ...s } as unknown as Stripe.Response<Stripe.Subscription>;
      }) as unknown as StripeSubscriptionsApi["retrieve"],
    };
  }
}

/** A database that refuses to complete while the mirror shows a live subscription, as migration 0009 does. */
class FakeDb {
  due: { user_id: string; stripe_subscription_id: string; live: boolean }[] = [];
  deleted: string[] = [];
  authRemoved: string[] = [];
  calls: string[] = [];

  deps(stripe: FakeStripeSubscriptions): DeletionJobDeps {
    return {
      dueSubscriptions: async () => {
        this.calls.push("due");
        return this.due.filter((d) => d.live).map(({ user_id, stripe_subscription_id }) => ({ user_id, stripe_subscription_id }));
      },
      cancelSubscription: (id) => {
        this.calls.push(`cancel:${id}`);
        return stripeCanceller(stripe.api())(id);
      },
      markSubscriptionCancelled: async (id) => {
        this.calls.push(`mark:${id}`);
        for (const d of this.due) if (d.stripe_subscription_id === id) d.live = false;
      },
      completeDueDeletions: async () => {
        this.calls.push("complete");
        if (this.due.some((d) => d.live)) throw new Error("object_not_in_prerequisite_state");
        const ids = [...new Set(this.due.map((d) => d.user_id))];
        this.deleted.push(...ids);
        return ids;
      },
      deleteAuthUser: async (id) => {
        this.calls.push(`auth:${id}`);
        return "removed";
      },
      markAuthRemoved: async (id) => {
        this.authRemoved.push(id);
        return true;
      },
    };
  }
}

describe("runDeletionJob", () => {
  it("cancels a live membership in Stripe before anything is deleted", async () => {
    const stripe = new FakeStripeSubscriptions();
    stripe.subs.set("sub_a", { id: "sub_a", status: "active" });
    const db = new FakeDb();
    db.due.push({ user_id: "u_a", stripe_subscription_id: "sub_a", live: true });

    const out = await runDeletionJob(db.deps(stripe));
    expect(out).toEqual({ status: "ok", subscriptions_cancelled: 1, subscriptions_failed: 0, refunds_issued: 0, refunds_failed: 0, customers_redacted: 0, redactions_failed: 0, processed: 1, auth_removed: 1, auth_failed: 0 });
    expect(stripe.cancelled).toEqual(["sub_a"]);
    expect(db.calls).toEqual(["due", "cancel:sub_a", "mark:sub_a", "complete", "auth:u_a"]);
  });

  it("deletes nothing when Stripe cannot cancel, and says so", async () => {
    const stripe = new FakeStripeSubscriptions();
    stripe.subs.set("sub_a", { id: "sub_a", status: "active" });
    stripe.failOn.add("sub_a");
    const db = new FakeDb();
    db.due.push({ user_id: "u_a", stripe_subscription_id: "sub_a", live: true });

    const out = await runDeletionJob(db.deps(stripe));
    expect(out.status).toBe("blocked");
    expect(out.subscriptions_failed).toBe(1);
    expect(db.calls).not.toContain("complete");
    expect(db.deleted).toEqual([]);
  });

  it("treats a subscription Stripe no longer has, or one already cancelled, as done", async () => {
    const stripe = new FakeStripeSubscriptions();
    stripe.subs.set("sub_b", { id: "sub_b", status: "canceled" });
    const db = new FakeDb();
    db.due.push({ user_id: "u_a", stripe_subscription_id: "sub_gone", live: true });
    db.due.push({ user_id: "u_b", stripe_subscription_id: "sub_b", live: true });

    const out = await runDeletionJob(db.deps(stripe));
    expect(out).toMatchObject({ status: "ok", subscriptions_cancelled: 2, processed: 2 });
    expect(stripe.cancelled).toEqual([]);
  });

  it("runs as before when nobody due has a membership", async () => {
    const stripe = new FakeStripeSubscriptions();
    const db = new FakeDb();
    const out = await runDeletionJob(db.deps(stripe));
    expect(out).toEqual({ status: "ok", subscriptions_cancelled: 0, subscriptions_failed: 0, refunds_issued: 0, refunds_failed: 0, customers_redacted: 0, redactions_failed: 0, processed: 0, auth_removed: 0, auth_failed: 0 });
    expect(db.calls).toEqual(["due", "complete"]);
  });

  it("counts an auth removal that failed so the next run retries it", async () => {
    const db = new FakeDb();
    db.due.push({ user_id: "u_a", stripe_subscription_id: "sub_x", live: false });
    const deps = { ...db.deps(new FakeStripeSubscriptions()), deleteAuthUser: async () => "failed" as const };
    const out = await runDeletionJob(deps);
    expect(out).toMatchObject({ processed: 1, auth_removed: 0, auth_failed: 1 });
  });
});

describe("stripeCanceller", () => {
  it("cancels immediately with no proration and no final invoice", async () => {
    const seen: unknown[] = [];
    const api = {
      cancel: (async (id: string, params: unknown) => {
        seen.push([id, params]);
        return { id, status: "canceled" };
      }) as unknown as StripeSubscriptionsApi["cancel"],
      retrieve: (async () => {
        throw new Error("not called");
      }) as unknown as StripeSubscriptionsApi["retrieve"],
    };
    await expect(stripeCanceller(api)("sub_1")).resolves.toBe("cancelled");
    expect(seen).toEqual([["sub_1", { invoice_now: false, prorate: false }]]);
  });

  it("throws when Stripe returns a subscription that is still live", async () => {
    const api = {
      cancel: (async (id: string) => ({ id, status: "active" })) as unknown as StripeSubscriptionsApi["cancel"],
      retrieve: (async (id: string) => ({ id, status: "active" })) as unknown as StripeSubscriptionsApi["retrieve"],
    };
    await expect(stripeCanceller(api)("sub_1")).rejects.toThrow(/still active/);
  });
});

// ---------------------------------------------------------------------------
// Refund and redaction (decision 6, follow-ups 1 and 2)
// ---------------------------------------------------------------------------

const DAY_S = 86_400;
const NOW = new Date("2026-10-07T12:00:00Z");
const T = Math.floor(NOW.getTime() / 1000);

/** Reader A: a monthly membership that started `startedDaysAgo` days ago, first invoice paid then. */
function billing(startedDaysAgo = 3) {
  const f = new FakeStripeBilling();
  const start = T - startedDaysAgo * DAY_S;
  f.subs.set("sub_a", { id: "sub_a", status: "active", customer: "cus_a", start_date: start, interval: "month", cancel_at_period_end: false, cancel_at: null, canceled_at: null });
  f.invoices.push({ id: "in_a1", subscription: "sub_a", amount_paid: 799, currency: "gbp", billing_reason: "subscription_create", paid_at: start, period: { start, end: start + 30 * DAY_S }, payment: { payment_intent: "pi_a1" } });
  f.customers.set("cus_a", {
    id: "cus_a",
    name: "Sam Reader",
    email: "sam@example.com",
    phone: "+447700900123",
    address: { line1: "1 Example Street", city: "Edinburgh", country: "GB" },
    shipping: null,
    metadata: { user_id: "u_a", tenant_id: "t_1" },
  });
  return f;
}

describe("stripeSettlement.redactCustomer", () => {
  it("clears name, email, phone and address, and leaves only the deleted flag in metadata", async () => {
    const f = billing();
    await stripeSettlement(f.api(), () => NOW).redactCustomer("cus_a");
    expect(f.updates).toEqual([
      { id: "cus_a", params: { name: "", email: "", phone: "", address: "", shipping: "", metadata: { user_id: "", tenant_id: "", [DELETED_FLAG]: "true" } } },
    ]);
    expect(f.customers.get("cus_a")).toEqual({ id: "cus_a", name: null, email: null, phone: null, address: null, shipping: null, metadata: { [DELETED_FLAG]: "true" } });
  });

  it("leaves a customer Stripe has already deleted alone", async () => {
    const f = billing();
    await stripeSettlement(f.api(), () => NOW).redactCustomer("cus_gone");
    expect(f.updates).toEqual([]);
  });
});

describe("runDeletionJob with refund and redaction", () => {
  function setup(startedDaysAgo = 3) {
    const subs = new FakeStripeSubscriptions();
    subs.subs.set("sub_a", { id: "sub_a", status: "active" });
    const db = new FakeDb();
    db.due.push({ user_id: "u_a", stripe_subscription_id: "sub_a", live: true });
    const f = billing(startedDaysAgo);
    const logs: [string, string][] = [];
    const settlement = stripeSettlement(f.api(), () => NOW);
    const customers = ["cus_a"];
    const deps: DeletionJobDeps = {
      ...db.deps(subs),
      refundUnused: settlement.refundUnused,
      dueCustomers: async () => customers,
      redactCustomer: settlement.redactCustomer,
      log: (code, reason) => logs.push([code, reason]),
    };
    return { subs, db, f, logs, deps, customers };
  }

  it("cancels, refunds, redacts, then deletes", async () => {
    const { db, f, logs, deps } = setup();
    const out = await runDeletionJob(deps);
    expect(out).toEqual({
      status: "ok",
      subscriptions_cancelled: 1,
      subscriptions_failed: 0,
      refunds_issued: 1,
      refunds_failed: 0,
      customers_redacted: 1,
      redactions_failed: 0,
      processed: 1,
      auth_removed: 1,
      auth_failed: 0,
    });
    // 30-day month started 3 days ago: 27 whole days unused.
    expect(f.refunds).toMatchObject([{ payment_intent: "pi_a1", amount: Math.floor((799 * 27) / 30), metadata: { akana_reason: "account_deletion", akana_refund_invoice: "in_a1" } }]);
    expect(f.customers.get("cus_a")?.email).toBeNull();
    expect(db.deleted).toEqual(["u_a"]);
    expect(logs).toEqual([]);
  });

  it("counts the 14 days from the membership start for the first period", async () => {
    const inside = setup(14);
    expect((await runDeletionJob(inside.deps)).refunds_issued).toBe(1);
    const outside = setup(15);
    const out = await runDeletionJob(outside.deps);
    expect(out).toMatchObject({ status: "ok", refunds_issued: 0, refunds_failed: 0, customers_redacted: 1, processed: 1 });
    expect(outside.f.refunds).toEqual([]);
  });

  it("refunds a yearly renewal paid in the last 14 days, but not a monthly one", async () => {
    const yearly = setup(400);
    yearly.f.subs.get("sub_a")!.interval = "year";
    const paid = T - 5 * DAY_S;
    yearly.f.invoices.push({ id: "in_a2", subscription: "sub_a", amount_paid: 6999, currency: "gbp", billing_reason: "subscription_cycle", paid_at: paid, period: { start: paid, end: paid + 365 * DAY_S }, payment: { payment_intent: "pi_a2" } });
    await runDeletionJob(yearly.deps);
    expect(yearly.f.refunds).toMatchObject([{ payment_intent: "pi_a2", amount: Math.floor((6999 * 360) / 365) }]);

    const monthly = setup(400);
    const mpaid = T - 2 * DAY_S;
    monthly.f.invoices.push({ id: "in_a3", subscription: "sub_a", amount_paid: 799, currency: "gbp", billing_reason: "subscription_cycle", paid_at: mpaid, period: { start: mpaid, end: mpaid + 30 * DAY_S }, payment: { payment_intent: "pi_a3" } });
    await runDeletionJob(monthly.deps);
    expect(monthly.f.refunds).toEqual([]);
  });

  it("refunds once per invoice even if the portal cancel already refunded it", async () => {
    const { f, deps } = setup();
    f.refunds.push({ id: "re_old", payment_intent: "pi_a1", amount: 719, status: "succeeded", metadata: { akana_refund_invoice: "in_a1" } });
    const out = await runDeletionJob(deps);
    expect(out.refunds_issued).toBe(0);
    expect(f.refunds).toHaveLength(1);
  });

  it("still deletes when the refund fails after the cancel, and logs a code with no ids", async () => {
    const { db, f, logs, deps } = setup();
    f.failRefund = true;
    const out = await runDeletionJob(deps);
    expect(out).toMatchObject({ status: "ok", subscriptions_cancelled: 1, refunds_issued: 0, refunds_failed: 1, customers_redacted: 1, processed: 1 });
    expect(db.deleted).toEqual(["u_a"]);
    expect(logs).toEqual([["deletion_refund_failed", "charge_disputed"]]);
    expect(JSON.stringify(logs)).not.toMatch(/re_|cus_|pi_|sub_/);
  });

  it("redacts every linked customer, with or without a live membership, and counts each failure", async () => {
    const { db, f, logs, deps, customers } = setup();
    db.due[0]!.live = false; // the membership ended long ago: nothing to cancel
    for (const id of ["cus_b", "cus_c"]) {
      f.customers.set(id, { id, name: "Old", email: `${id}@example.com`, phone: null, address: null, shipping: null, metadata: {} });
      customers.push(id);
    }
    customers.push("cus_a"); // listed twice: redacted once
    f.failUpdate.add("cus_b");
    const out = await runDeletionJob(deps);
    expect(out).toMatchObject({ status: "ok", subscriptions_cancelled: 0, refunds_issued: 0, customers_redacted: 2, redactions_failed: 1, processed: 1 });
    expect(f.updates.map((u) => u.id)).toEqual(["cus_a", "cus_c"]);
    expect(f.customers.get("cus_c")).toMatchObject({ name: null, email: null, metadata: { [DELETED_FLAG]: "true" } });
    expect(db.deleted).toEqual(["u_a"]);
    expect(logs).toEqual([["deletion_redact_failed", "StripeConnectionError"]]);
  });

  it("still deletes when the customer lookup itself fails", async () => {
    const { db, logs, deps } = setup();
    const out = await runDeletionJob({ ...deps, dueCustomers: async () => Promise.reject(Object.assign(new Error("x"), { code: "42501" })) });
    expect(out).toMatchObject({ status: "ok", customers_redacted: 0, redactions_failed: 1, processed: 1 });
    expect(db.deleted).toEqual(["u_a"]);
    expect(logs).toEqual([["deletion_redact_lookup_failed", "42501"]]);
  });

  it("does not refund a subscription that had already ended before the job ran", async () => {
    const { subs, f, deps } = setup();
    subs.subs.get("sub_a")!.status = "canceled";
    const out = await runDeletionJob(deps);
    expect(out).toMatchObject({ status: "ok", subscriptions_cancelled: 1, refunds_issued: 0, customers_redacted: 1 });
    expect(f.refunds).toEqual([]);
  });

  it("neither refunds nor redacts when a cancel fails, and deletes nothing", async () => {
    const { subs, f, db, deps } = setup();
    subs.failOn.add("sub_a");
    const out = await runDeletionJob(deps);
    expect(out).toMatchObject({ status: "blocked", subscriptions_failed: 1, refunds_issued: 0, customers_redacted: 0 });
    expect(f.refunds).toEqual([]);
    expect(f.updates).toEqual([]);
    expect(db.deleted).toEqual([]);
  });
});

describe("errorCode", () => {
  it("returns a code or type and never a message", () => {
    expect(errorCode(Object.assign(new Error("No such customer: cus_123"), { code: "resource_missing" }))).toBe("resource_missing");
    expect(errorCode(Object.assign(new Error("x"), { type: "StripeConnectionError" }))).toBe("StripeConnectionError");
    expect(errorCode(new Error("cus_123 secret"))).toBe("unknown");
    expect(errorCode(null)).toBe("unknown");
  });
});
