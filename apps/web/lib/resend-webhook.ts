import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The Resend webhook, as pure functions (review finding M17).
 *
 * Resend signs each delivery the Svix way. The signed text is
 * "<svix-id>.<svix-timestamp>.<raw body>", the key is the base64 part of the
 * signing secret (after "whsec_"), and the svix-signature header holds one
 * or more "v1,<base64 HMAC-SHA256>" values separated by spaces. A delivery
 * older or newer than five minutes is refused, so a captured one cannot be
 * replayed later. The svix-id is the same on every retry of one event, so
 * the database stores it once (migration 0076) and a repeat does nothing.
 *
 * No address is logged or returned from here.
 */
export const SVIX_TOLERANCE_SECONDS = 5 * 60;

export type SvixHeaders = { id: string | null; timestamp: string | null; signature: string | null };

export type VerifyResult = { ok: true } | { ok: false; reason: "missing_headers" | "bad_secret" | "stale" | "bad_signature" };

export function verifySvix(rawBody: string, headers: SvixHeaders, secret: string, now: Date = new Date()): VerifyResult {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return { ok: false, reason: "missing_headers" };
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  if (key.length === 0) return { ok: false, reason: "bad_secret" };
  const seconds = Number(timestamp);
  if (!/^\d{1,12}$/.test(timestamp) || !Number.isFinite(seconds)) return { ok: false, reason: "stale" };
  if (Math.abs(Math.floor(now.getTime() / 1000) - seconds) > SVIX_TOLERANCE_SECONDS) return { ok: false, reason: "stale" };
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();
  for (const part of signature.split(" ")) {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) continue;
    const given = Buffer.from(value, "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) return { ok: true };
  }
  return { ok: false, reason: "bad_signature" };
}

/** Signs a body the same way. For tests and local trials only. */
export function signSvix(rawBody: string, id: string, timestamp: string, secret: string): string {
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64")}`;
}

export type SuppressionReason = "bounced" | "complained";
export type ParsedEvent = { type: string; reason: SuppressionReason | null; addresses: string[] };

/**
 * What an event means for the suppression list.
 *   email.bounced     the receiving server refused the address for good: suppress.
 *                     A bounce Resend marks as transient is recorded and suppresses nobody.
 *   email.complained  the person marked the email as spam: suppress.
 *   anything else     recorded once, suppresses nobody.
 */
export function parseResendEvent(payload: unknown): ParsedEvent | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as { type?: unknown; data?: { to?: unknown; bounce?: { type?: unknown } | null } | null };
  if (typeof p.type !== "string" || p.type.length < 1 || p.type.length > 80) return null;
  const to = p.data?.to;
  const list = Array.isArray(to) ? to : typeof to === "string" ? [to] : [];
  const addresses = list.filter((a): a is string => typeof a === "string" && a.includes("@") && a.length <= 254).slice(0, 50);
  let reason: SuppressionReason | null = null;
  if (p.type === "email.complained") reason = "complained";
  if (p.type === "email.bounced") {
    const kind = typeof p.data?.bounce?.type === "string" ? p.data.bounce.type.toLowerCase() : "";
    reason = kind === "transient" || kind === "temporary" ? null : "bounced";
  }
  return { type: p.type, reason, addresses: reason ? addresses : [] };
}

export type WebhookDeps = {
  /** RESEND_WEBHOOK_SECRET. Blank means the route is switched off. */
  secret: string | undefined;
  /** public.email_webhook_record(): "recorded" the first time, "replay" after. Throws on a database error. */
  record(eventId: string, type: string, reason: SuppressionReason | null, addresses: string[]): Promise<string>;
  now?: () => Date;
};

export type WebhookOutcome = { status: number; body: Record<string, unknown> };

export async function handleResendWebhook(rawBody: string, headers: SvixHeaders, deps: WebhookDeps): Promise<WebhookOutcome> {
  const secret = (deps.secret ?? "").trim();
  if (!secret) return { status: 503, body: { error: "not_configured" } };
  const verified = verifySvix(rawBody, headers, secret, deps.now?.() ?? new Date());
  if (!verified.ok) return { status: verified.reason === "missing_headers" ? 400 : 401, body: { error: verified.reason } };
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "invalid_json" } };
  }
  const event = parseResendEvent(payload);
  if (!event) return { status: 400, body: { error: "invalid_event" } };
  const id = (headers.id ?? "").slice(0, 200);
  try {
    const result = await deps.record(id, event.type, event.reason, event.addresses);
    return { status: 200, body: { received: true, replay: result === "replay" } };
  } catch {
    // 500 so the provider sends it again.
    return { status: 500, body: { error: "sql_failed" } };
  }
}
