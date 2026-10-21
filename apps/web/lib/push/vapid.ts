import { createPrivateKey, createSign } from "node:crypto";

/**
 * Web Push signing (13.19), the pure part. Akana sends a push with no body:
 * the notification wording is fixed in the service worker, so nothing about
 * a reader or a workbook ever travels through a push service. That means no
 * payload encryption is needed, only the VAPID header (RFC 8292) that proves
 * the message comes from this site.
 *
 * Keys come from the environment (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
 * VAPID_SUBJECT); `pnpm tsx scripts/new-vapid-keys.ts` makes a pair. While
 * any is blank, push is hidden everywhere and the job does nothing.
 */

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

const B64URL = /^[A-Za-z0-9_-]+$/;

/** The configuration, or null while any part is missing or malformed. */
export function vapidFromEnv(env: Record<string, string | undefined> = process.env): VapidConfig | null {
  const publicKey = (env.VAPID_PUBLIC_KEY ?? "").trim();
  const privateKey = (env.VAPID_PRIVATE_KEY ?? "").trim();
  const subject = (env.VAPID_SUBJECT ?? "").trim();
  if (!publicKey || !privateKey || !subject) return null;
  if (!B64URL.test(publicKey) || !B64URL.test(privateKey)) return null;
  if (Buffer.from(publicKey, "base64url").length !== 65 || Buffer.from(privateKey, "base64url").length !== 32) return null;
  if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(subject)) return null;
  return { publicKey, privateKey, subject };
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** The audience for a push endpoint: its origin. */
export function audienceOf(endpoint: string): string | null {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

/** A signed VAPID token (ES256 JWT) for one push service, valid for `ttlSeconds` (at most 24 hours). */
export function vapidJwt(config: VapidConfig, audience: string, now: Date = new Date(), ttlSeconds = 12 * 3600): string {
  const exp = Math.floor(now.getTime() / 1000) + Math.min(ttlSeconds, 24 * 3600);
  const head = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = b64u(JSON.stringify({ aud: audience, exp, sub: config.subject }));
  const pub = Buffer.from(config.publicKey, "base64url");
  const key = createPrivateKey({
    key: { kty: "EC", crv: "P-256", x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)), d: config.privateKey },
    format: "jwk",
  });
  const sig = createSign("SHA256").update(`${head}.${body}`).sign({ key, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64u(sig)}`;
}

/** The headers for one body-less push. Topic replaces a push still waiting; Urgency low lets the phone batch it. */
export function pushHeaders(config: VapidConfig, endpoint: string, now: Date = new Date()): Record<string, string> | null {
  const aud = audienceOf(endpoint);
  if (!aud) return null;
  return {
    Authorization: `vapid t=${vapidJwt(config, aud, now)}, k=${config.publicKey}`,
    TTL: "7200",
    Urgency: "low",
    Topic: "daily-step",
    "Content-Length": "0",
  };
}

/** Browsers want the public key as bytes when subscribing. */
export function applicationServerKey(publicKey: string): Uint8Array {
  return new Uint8Array(Buffer.from(publicKey, "base64url"));
}
