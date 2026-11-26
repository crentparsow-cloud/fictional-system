import { describe, expect, it } from "vitest";
import { checkoutIdempotencyKey } from "@/lib/checkout-idempotency";

/** L6: the key Stripe uses to answer a repeated Checkout Session request with the first session. */
describe("checkoutIdempotencyKey", () => {
  const now = new Date("2026-11-25T10:00:10Z");
  const params = { mode: "payment", metadata: { user_id: "u1", consent_id: "77" }, line_items: [{ quantity: 1 }] };

  it("is the same for the same request, whatever order the fields are in", () => {
    const a = checkoutIdempotencyKey("workbook", "u1", params, { now });
    const b = checkoutIdempotencyKey("workbook", "u1", { line_items: [{ quantity: 1 }], metadata: { consent_id: "77", user_id: "u1" }, mode: "payment" }, { now });
    expect(a).toBe(b);
    expect(a).toMatch(/^akana-checkout-workbook-[0-9a-f]{48}$/);
    expect(a.length).toBeLessThanOrEqual(255);
  });

  it("differs when anything Stripe would see differs, so Stripe never gets one key with two requests", () => {
    const base = checkoutIdempotencyKey("workbook", "u1", params, { now });
    expect(checkoutIdempotencyKey("workbook", "u1", { ...params, metadata: { user_id: "u1", consent_id: "78" } }, { now })).not.toBe(base);
    expect(checkoutIdempotencyKey("workbook", "u2", params, { now })).not.toBe(base);
    expect(checkoutIdempotencyKey("bundle", "u1", params, { now })).not.toContain(base.slice(-48));
    expect(checkoutIdempotencyKey("workbook", "u1", params, { now, extra: "x" })).not.toBe(base);
  });

  it("starts afresh after the minute, so a later identical request gets a new session", () => {
    const base = checkoutIdempotencyKey("gift", "u1", params, { now });
    expect(checkoutIdempotencyKey("gift", "u1", params, { now: new Date(now.getTime() + 20_000) })).toBe(base);
    expect(checkoutIdempotencyKey("gift", "u1", params, { now: new Date(now.getTime() + 60_000) })).not.toBe(base);
  });

  it("carries nothing personal", () => {
    const key = checkoutIdempotencyKey("gift", "user-1", { customer_email: "reader@example.test" }, { now, extra: "friend@example.test" });
    expect(key).not.toMatch(/user-1|reader|friend|example/);
  });
});
