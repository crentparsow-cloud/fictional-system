import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { handleBundleEvent, type BundleRepo } from "@/lib/bundle-webhook";

class Repo implements BundleRepo {
  result = { found: true, changed: true, id: "b1" as string | null };
  failed: string[] = [];
  refunds: string[] = [];
  known = new Set(["pi_1"]);
  refundChanged = true;
  async markPaid() {
    return this.result;
  }
  async markFailed(s: string) {
    this.failed.push(s);
  }
  async findByPaymentIntent(pi: string) {
    return this.known.has(pi) ? { id: "b1" } : null;
  }
  async refund(pi: string) {
    this.refunds.push(pi);
    return { changed: this.refundChanged };
  }
}

const session = (over: Record<string, unknown> = {}, type = "checkout.session.completed"): Stripe.Event =>
  ({ id: "e", type, data: { object: { id: "cs_b", payment_status: "paid", payment_intent: "pi_1", amount_total: 2499, total_details: { amount_tax: 0 }, metadata: { kind: "bundle" }, ...over } } }) as unknown as Stripe.Event;
const charge = (over: Record<string, unknown> = {}): Stripe.Event =>
  ({ id: "e", type: "charge.refunded", data: { object: { payment_intent: "pi_1", refunded: true, ...over } } }) as unknown as Stripe.Event;

describe("bundle events", () => {
  it("opens the titles on a paid session, once", async () => {
    const repo = new Repo();
    expect(await handleBundleEvent(session(), repo)).toEqual({ action: "bundle_paid", bundleId: "b1" });
    repo.result = { found: true, changed: false, id: "b1" };
    expect((await handleBundleEvent(session(), repo))?.action).toBe("bundle_repeat");
  });
  it("waits for payment and reports an unknown session", async () => {
    const repo = new Repo();
    expect((await handleBundleEvent(session({ payment_status: "unpaid" }), repo))?.action).toBe("bundle_unpaid");
    repo.result = { found: false, changed: false, id: null };
    expect((await handleBundleEvent(session(), repo))?.action).toBe("bundle_unknown");
  });
  it("closes a failed or expired session", async () => {
    const repo = new Repo();
    expect((await handleBundleEvent(session({}, "checkout.session.expired"), repo))?.action).toBe("bundle_failed");
    expect(repo.failed).toEqual(["cs_b"]);
  });
  it("refunds in full, ignores a partial refund, passes on other payments", async () => {
    const repo = new Repo();
    expect((await handleBundleEvent(charge(), repo))?.action).toBe("bundle_refunded");
    repo.refundChanged = false;
    expect((await handleBundleEvent(charge(), repo))?.action).toBe("bundle_refund_repeat");
    expect((await handleBundleEvent(charge({ refunded: false }), repo))?.action).toBe("bundle_partial_refund");
    expect(await handleBundleEvent(charge({ payment_intent: "pi_other" }), repo)).toBeNull();
  });
  it("closes the bundle's titles when its payment is disputed", async () => {
    const repo = new Repo();
    const dispute = (pi: string) => ({ id: "e", type: "charge.dispute.created", data: { object: { payment_intent: pi } } }) as unknown as Stripe.Event;
    expect((await handleBundleEvent(dispute("pi_1"), repo))?.action).toBe("bundle_disputed");
    expect(repo.refunds).toEqual(["pi_1"]);
    expect(await handleBundleEvent(dispute("pi_other"), repo)).toBeNull();
  });
  it("is not about a bundle when the metadata says otherwise", async () => {
    expect(await handleBundleEvent(session({ metadata: { kind: "gift" } }), new Repo())).toBeNull();
    expect(await handleBundleEvent(session({ metadata: {} }), new Repo())).toBeNull();
  });
});
