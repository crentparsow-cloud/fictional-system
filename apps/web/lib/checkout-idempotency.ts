import { createHash } from "node:crypto";

/**
 * The idempotency key for creating a Stripe Checkout Session (review L6).
 *
 * Stripe keeps a key for 24 hours and answers a repeat of the same request
 * with the first session instead of making a second one. So a request that
 * is sent twice (a retry after a timeout, a double press) leaves one payable
 * session, not two.
 *
 * The key is a hash of who is paying, what the session is for, and every
 * parameter sent to Stripe, so two requests share a key only when Stripe
 * would see the same request. The workbook, membership and bundle checkouts
 * carry the id of the consent row recorded for this attempt in their
 * metadata, so each attempt has its own key. The gift and organisation
 * checkouts have no such row, so the minute is part of the key: the same
 * request inside one minute gives the same session, and a later one starts
 * afresh. `extra` holds anything that makes two requests different but is
 * not sent to Stripe (the gift's recipient).
 *
 * Nothing personal is in the key: it is a hash.
 */
export type CheckoutKind = "workbook" | "membership" | "gift" | "bundle" | "org_signup" | "org_plan";

export function checkoutIdempotencyKey(
  kind: CheckoutKind,
  userId: string,
  params: unknown,
  o: { extra?: string; now?: Date; windowSeconds?: number } = {},
): string {
  const window = o.windowSeconds ?? 60;
  const bucket = Math.floor((o.now ?? new Date()).getTime() / 1000 / window);
  const hash = createHash("sha256").update([kind, userId, stable(params), o.extra ?? "", String(bucket)].join("\n")).digest("hex");
  return `akana-checkout-${kind}-${hash.slice(0, 48)}`;
}

/** JSON with object keys in order, so the same parameters always give the same text. */
function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(",")}}`;
}
