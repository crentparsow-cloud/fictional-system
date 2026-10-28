import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { handleGiftEvent, type GiftMail, type GiftRepo, type PaidGift } from "@/lib/gift-webhook";

const gift = (over: Partial<PaidGift> = {}): PaidGift => ({
  id: "g1",
  buyerId: "u1",
  months: 3,
  recipientEmail: "friend@example.test",
  recipientName: "Fran",
  senderName: "Sam",
  message: "Happy reading.",
  token: "t".repeat(32),
  claimBy: "2027-10-21T00:00:00Z",
  delivered: false,
  changed: true,
  ...over,
});

class Repo implements GiftRepo {
  paid: PaidGift | null = gift();
  delivered: string[] = [];
  failed: string[] = [];
  refunds: string[] = [];
  refundResult = { changed: true, wasClaimed: false };
  known = new Set<string>(["pi_1"]);
  marked: { session: string; amountMinor: number | null; taxMinor: number | null; currency: string | null }[] = [];
  async markPaid(a: Parameters<GiftRepo["markPaid"]>[0]) {
    this.marked.push({ session: a.session, amountMinor: a.amountMinor, taxMinor: a.taxMinor, currency: a.currency });
    return this.paid;
  }
  async markDelivered(id: string) {
    this.delivered.push(id);
  }
  async markFailed(s: string) {
    this.failed.push(s);
  }
  async findByPaymentIntent(pi: string) {
    return this.known.has(pi) ? { id: "g1" } : null;
  }
  async refund(pi: string) {
    this.refunds.push(pi);
    return this.refundResult;
  }
  async buyerContact() {
    return { email: "buyer@example.test", name: "Sam" };
  }
}

class Mail implements GiftMail {
  received_: string[] = [];
  sent_: string[] = [];
  ok = true;
  async received(g: PaidGift) {
    this.received_.push(g.id);
    return this.ok;
  }
  async sent(g: PaidGift) {
    this.sent_.push(g.id);
  }
}

const session = (over: Record<string, unknown> = {}): Stripe.Event =>
  ({
    id: "evt_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_1",
        payment_status: "paid",
        payment_intent: "pi_1",
        amount_total: 2397,
        currency: "gbp",
        total_details: { amount_tax: 0 },
        metadata: { kind: "gift", user_id: "u1" },
        ...over,
      },
    },
  }) as unknown as Stripe.Event;

const charge = (over: Record<string, unknown> = {}): Stripe.Event =>
  ({ id: "evt_2", type: "charge.refunded", data: { object: { id: "ch_1", payment_intent: "pi_1", refunded: true, ...over } } }) as unknown as Stripe.Event;

describe("a paid gift", () => {
  it("emails the recipient and the buyer, then marks it delivered", async () => {
    const repo = new Repo();
    const mail = new Mail();
    const out = await handleGiftEvent(session(), repo, mail);
    expect(out).toEqual({ action: "gift_paid", giftId: "g1", delivered: true });
    expect(mail.received_).toEqual(["g1"]);
    expect(mail.sent_).toEqual(["g1"]);
    expect(repo.delivered).toEqual(["g1"]);
    expect(repo.marked[0]).toEqual({ session: "cs_1", amountMinor: 2397, taxMinor: 0, currency: "GBP" });
  });
  it("sends nothing on a repeat delivery", async () => {
    const repo = new Repo();
    repo.paid = gift({ delivered: true, changed: false });
    const mail = new Mail();
    expect(await handleGiftEvent(session(), repo, mail)).toEqual({ action: "gift_repeat", giftId: "g1", delivered: true });
    expect(mail.received_).toEqual([]);
    expect(repo.delivered).toEqual([]);
  });
  it("tries the email again next time when it failed, and does not mark it delivered", async () => {
    const repo = new Repo();
    const mail = new Mail();
    mail.ok = false;
    const out = await handleGiftEvent(session(), repo, mail);
    expect(out).toEqual({ action: "gift_paid", giftId: "g1", delivered: false });
    expect(repo.delivered).toEqual([]);
    expect(mail.sent_).toEqual([]);
    // the retry: paid already, not delivered, so the email is tried again
    repo.paid = gift({ changed: false });
    mail.ok = true;
    const retry = await handleGiftEvent(session(), repo, mail);
    expect(retry?.delivered).toBe(true);
    expect(repo.delivered).toEqual(["g1"]);
    expect(mail.sent_).toEqual([]);
  });
  it("waits for payment on a delayed method", async () => {
    const repo = new Repo();
    const out = await handleGiftEvent(session({ payment_status: "unpaid" }), repo, new Mail());
    expect(out?.action).toBe("gift_unpaid");
    expect(repo.marked).toEqual([]);
  });
  it("says so when the session is unknown", async () => {
    const repo = new Repo();
    repo.paid = null;
    expect((await handleGiftEvent(session(), repo, new Mail()))?.action).toBe("gift_unknown");
  });
  it("is not about a gift when the metadata says otherwise", async () => {
    expect(await handleGiftEvent(session({ metadata: { user_id: "u1" } }), new Repo(), new Mail())).toBeNull();
    expect(await handleGiftEvent(session({ metadata: { kind: "bundle" } }), new Repo(), new Mail())).toBeNull();
  });
});

describe("a gift that did not go through", () => {
  it("closes on failure or expiry", async () => {
    const repo = new Repo();
    const failed = { ...session(), type: "checkout.session.async_payment_failed" } as unknown as Stripe.Event;
    const expired = { ...session(), type: "checkout.session.expired" } as unknown as Stripe.Event;
    expect((await handleGiftEvent(failed, repo, new Mail()))?.action).toBe("gift_failed");
    expect((await handleGiftEvent(expired, repo, new Mail()))?.action).toBe("gift_failed");
    expect(repo.failed).toEqual(["cs_1", "cs_1"]);
  });
});

describe("a refund", () => {
  it("ends a gift on a full refund", async () => {
    const repo = new Repo();
    expect(await handleGiftEvent(charge(), repo, new Mail())).toEqual({ action: "gift_refunded", giftId: "g1" });
    expect(repo.refunds).toEqual(["pi_1"]);
  });
  it("does nothing twice", async () => {
    const repo = new Repo();
    repo.refundResult = { changed: false, wasClaimed: true };
    expect((await handleGiftEvent(charge(), repo, new Mail()))?.action).toBe("gift_refund_repeat");
  });
  it("leaves a partial refund for staff", async () => {
    const repo = new Repo();
    expect((await handleGiftEvent(charge({ refunded: false }), repo, new Mail()))?.action).toBe("gift_partial_refund");
    expect(repo.refunds).toEqual([]);
  });
  it("passes on a refund that is not a gift's", async () => {
    expect(await handleGiftEvent(charge({ payment_intent: "pi_other" }), new Repo(), new Mail())).toBeNull();
    expect(await handleGiftEvent(charge({ payment_intent: null }), new Repo(), new Mail())).toBeNull();
  });
  it("ends a gift when its payment is disputed", async () => {
    const repo = new Repo();
    const dispute = { id: "e3", type: "charge.dispute.created", data: { object: { id: "dp_1", payment_intent: "pi_1" } } } as unknown as Stripe.Event;
    expect(await handleGiftEvent(dispute, repo, new Mail())).toEqual({ action: "gift_disputed", giftId: "g1" });
    expect(repo.refunds).toEqual(["pi_1"]);
    const other = { id: "e4", type: "charge.dispute.created", data: { object: { id: "dp_2", payment_intent: "pi_other" } } } as unknown as Stripe.Event;
    expect(await handleGiftEvent(other, new Repo(), new Mail())).toBeNull();
  });
  it("ignores other event types", async () => {
    expect(await handleGiftEvent({ id: "e", type: "invoice.paid", data: { object: {} } } as unknown as Stripe.Event, new Repo(), new Mail())).toBeNull();
  });
});
