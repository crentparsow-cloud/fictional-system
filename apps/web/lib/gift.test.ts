import { describe, expect, it } from "vitest";
import {
  checkGiftInput,
  claimUrl,
  giftCheckoutParams,
  giftLength,
  giftMembershipLine,
  giftMessageMaxFrom,
  giftMonthsFrom,
  giftOptions,
  giftPriceMinor,
  isClaimToken,
  newClaimToken,
  plainLine,
} from "@/lib/gift";

const OPTS = { allowedMonths: [1, 3, 6, 12], messageMax: 300, buyerEmail: "buyer@example.test" };

describe("gift prices", () => {
  it("multiplies the monthly price for 1, 3 and 6 months and uses the annual price for 12", () => {
    expect(giftPriceMinor(1, 799, 6999)).toBe(799);
    expect(giftPriceMinor(3, 799, 6999)).toBe(2397);
    expect(giftPriceMinor(6, 799, 6999)).toBe(4794);
    expect(giftPriceMinor(12, 799, 6999)).toBe(6999);
  });
  it("handles a whole number of years plus months", () => {
    expect(giftPriceMinor(18, 799, 6999)).toBe(6999 + 6 * 799);
    expect(giftPriceMinor(24, 799, 6999)).toBe(13998);
  });
  it("gives no price when the price it needs is missing", () => {
    expect(giftPriceMinor(3, null, 6999)).toBeNull();
    expect(giftPriceMinor(12, 799, null)).toBeNull();
    expect(giftPriceMinor(12, 799, 0)).toBeNull();
    expect(giftPriceMinor(0, 799, 6999)).toBeNull();
    expect(giftPriceMinor(2.5, 799, 6999)).toBeNull();
  });
  it("shows only the lengths that can be priced", () => {
    const all = giftOptions([1, 3, 6, 12], 799, 6999, "GBP");
    expect(all.map((o) => [o.months, o.price])).toEqual([
      [1, "£7.99"],
      [3, "£23.97"],
      [6, "£47.94"],
      [12, "£69.99"],
    ]);
    expect(giftOptions([1, 3, 6, 12], 799, null, "GBP").map((o) => o.months)).toEqual([1, 3, 6]);
    expect(giftOptions([1, 3, 6, 12], null, null, "GBP")).toEqual([]);
  });
  it("words the length", () => {
    expect(giftLength(1)).toBe("1 month");
    expect(giftLength(12)).toBe("12 months");
  });
});

describe("gift config", () => {
  it("reads the lengths and falls back to the defaults", () => {
    expect(giftMonthsFrom([{ key: "gift_months", value: [12, 3, 3, 1] }])).toEqual([1, 3, 12]);
    expect(giftMonthsFrom(null)).toEqual([1, 3, 6, 12]);
    expect(giftMonthsFrom([{ key: "gift_months", value: "nonsense" }])).toEqual([1, 3, 6, 12]);
    expect(giftMonthsFrom([{ key: "gift_months", value: [0, 99, "x"] }])).toEqual([1, 3, 6, 12]);
  });
  it("reads the message limit", () => {
    expect(giftMessageMaxFrom([{ key: "gift_message_max", value: 200 }])).toBe(200);
    expect(giftMessageMaxFrom(null)).toBe(300);
    expect(giftMessageMaxFrom([{ key: "gift_message_max", value: -4 }])).toBe(300);
  });
});

describe("the gift form", () => {
  const good = { months: "3", recipientEmail: " Friend@Example.TEST ", recipientName: "Fran", senderName: "Sam", message: "Happy reading." };
  it("accepts a good form and tidies it", () => {
    const r = checkGiftInput(good, OPTS);
    expect(r).toEqual({ ok: true, value: { months: 3, recipientEmail: "friend@example.test", recipientName: "Fran", senderName: "Sam", message: "Happy reading." } });
  });
  it("refuses a length that is not offered", () => {
    expect(checkGiftInput({ ...good, months: "2" }, OPTS)).toEqual({ ok: false, problem: "months" });
    expect(checkGiftInput({ ...good, months: undefined }, OPTS)).toEqual({ ok: false, problem: "months" });
  });
  it("refuses a bad address and the buyer's own", () => {
    expect(checkGiftInput({ ...good, recipientEmail: "nope" }, OPTS)).toEqual({ ok: false, problem: "recipient_email" });
    expect(checkGiftInput({ ...good, recipientEmail: "a b@c.d" }, OPTS)).toEqual({ ok: false, problem: "recipient_email" });
    expect(checkGiftInput({ ...good, recipientEmail: "BUYER@example.test" }, OPTS)).toEqual({ ok: false, problem: "own_email" });
  });
  it("refuses long names and a long message", () => {
    expect(checkGiftInput({ ...good, recipientName: "x".repeat(61) }, OPTS)).toEqual({ ok: false, problem: "recipient_name" });
    expect(checkGiftInput({ ...good, senderName: "x".repeat(61) }, OPTS)).toEqual({ ok: false, problem: "sender_name" });
    expect(checkGiftInput({ ...good, message: "x".repeat(301) }, OPTS)).toEqual({ ok: false, problem: "message" });
  });
  it("makes the message one line of plain text", () => {
    const r = checkGiftInput({ ...good, message: "Line one\n\nLine\ttwo\u0000" }, OPTS);
    expect(r.ok && r.value.message).toBe("Line one Line two");
    expect(plainLine(42, 10)).toBe("");
  });
});

describe("claim tokens", () => {
  it("are long, URL safe and different each time", () => {
    const a = newClaimToken();
    const b = newClaimToken();
    expect(isClaimToken(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(a.length).toBe(32);
  });
  it("rejects short or odd values", () => {
    expect(isClaimToken("short")).toBe(false);
    expect(isClaimToken("a".repeat(31))).toBe(false);
    expect(isClaimToken("a/".repeat(20))).toBe(false);
    expect(isClaimToken(undefined)).toBe(false);
  });
  it("builds the link", () => {
    expect(claimUrl("https://akana.test", "abc")).toBe("https://akana.test/gift/abc");
  });
});

describe("the Checkout Session", () => {
  const params = giftCheckoutParams({
    months: 3,
    priceMinor: 2397,
    currency: "GBP",
    userId: "u1",
    tenantId: "t1",
    buyerEmail: "buyer@example.test",
    successUrl: "https://akana.test/you?gift=paying",
    cancelUrl: "https://akana.test/gift",
  });
  it("is one payment with no subscription", () => {
    expect(params.mode).toBe("payment");
    expect(params.subscription_data).toBeUndefined();
    expect(params.line_items?.[0]?.price_data?.unit_amount).toBe(2397);
    expect(params.line_items?.[0]?.price_data?.currency).toBe("gbp");
    expect(params.line_items?.[0]?.price_data?.tax_behavior).toBe("inclusive");
    expect(params.automatic_tax).toEqual({ enabled: true });
  });
  it("tells Stripe nothing about the recipient or the message", () => {
    const text = JSON.stringify(params);
    expect(text).not.toMatch(/friend|recipient|message_text|Happy/i);
    expect(params.metadata).toEqual({ kind: "gift", user_id: "u1", tenant_id: "t1", months: "3" });
  });
});

describe("the You page line", () => {
  it("says it ends and does not renew", () => {
    const line = giftMembershipLine("2027-01-05T10:00:00Z");
    expect(line).toContain("5 January 2027");
    expect(line).toContain("does not renew");
    expect(line).not.toMatch(/free/i);
  });
});
