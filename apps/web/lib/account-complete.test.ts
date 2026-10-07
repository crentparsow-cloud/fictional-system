import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { runDeletionJob, stripeCanceller, type DeletionJobDeps, type StripeSubscriptionsApi } from "@/lib/account-complete";

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
    expect(out).toEqual({ status: "ok", subscriptions_cancelled: 1, subscriptions_failed: 0, processed: 1, auth_removed: 1, auth_failed: 0 });
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
    expect(out).toEqual({ status: "ok", subscriptions_cancelled: 0, subscriptions_failed: 0, processed: 0, auth_removed: 0, auth_failed: 0 });
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
