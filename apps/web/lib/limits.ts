import { randomUUID } from "node:crypto";
import { hashWithSalt, leadSalt } from "@/lib/leads";
import { createRateLimiter, type RateLimiter } from "@/lib/rate-limit";

/**
 * Database rate limits (F-143, migration 0027).
 *
 * Two calls, both thin:
 *   public.rate_limit_hit(bucket, key_hash)  service role, with a salted hash
 *                                            of an email address or an IP
 *   public.rate_limit_self(bucket)           the signed-in reader, counted
 *                                            against their own user id
 *
 * The rules (max hits and window) live in public.rate_limit_rules, so the
 * caller cannot choose its own limit:
 *   signin_email        5 an hour       signin_ip   20 an hour
 *   checkout_user       10 an hour      export_user 10 an hour
 *   partner_respond_ip  30 in 10 minutes
 *
 * A small in-memory limiter sits in front (lib/rate-limit.ts), as on the
 * enquiry form: it saves a database round trip when one address hammers a
 * form. The database count is the one that holds across server instances.
 *
 * What happens when the database cannot be asked (review M5):
 *
 *   sign-in and sign-up   fail closed. Without a count, anyone could ask for
 *                         links without limit, so the form says "try again
 *                         in a few minutes" (signinDecision).
 *   export                fail closed. The download holds everything and
 *                         can wait a few minutes (hitSelfState).
 *   checkout, partner     fail open, as before: the request goes ahead and
 *                         the failure is logged (hitSelf, hitKeyed).
 *   analytics counts      memory only, fail open (eventAllowed).
 *
 * Only an explicit false from the database means "limited".
 */
export type RateBucket = "signin_email" | "signin_ip" | "checkout_user" | "export_user" | "partner_respond_ip";
export type SelfBucket = Extract<RateBucket, "checkout_user" | "export_user">;

type Rpc = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string } | null }> };

export const CHECKOUT_BUSY_MESSAGE = "You have started checkout several times in the last hour. Please wait a few minutes and try again.";
export const EXPORT_UNAVAILABLE_MESSAGE = "Downloads are not available right now. Your work is safe. Please try again in a few minutes.";
export const EXPORT_BUSY_MESSAGE = "You have downloaded your work several times in the last hour. Please try again later. Your work is safe.";

/** What a limiter said: go ahead, over the limit, or the count could not be read or written. */
export type LimitState = "allowed" | "limited" | "unavailable";

async function ask(client: Rpc, fn: "rate_limit_hit" | "rate_limit_self", bucket: RateBucket, args: Record<string, unknown>): Promise<LimitState> {
  try {
    const { data, error } = await client.rpc(fn, args);
    if (error) {
      console.error("rate_limit_unavailable", bucket, error.code ?? "");
      return "unavailable";
    }
    if (data === false) return "limited";
    // Anything but a plain yes means the count cannot be relied on.
    return data === true ? "allowed" : "unavailable";
  } catch (e) {
    console.error("rate_limit_unavailable", bucket, e instanceof Error ? e.name : "unknown");
    return "unavailable";
  }
}

/** One hit against a keyed bucket, with the three answers kept apart. */
export function hitKeyedState(client: Rpc, bucket: RateBucket, keyHash: string): Promise<LimitState> {
  return ask(client, "rate_limit_hit", bucket, { p_bucket: bucket, p_key_hash: keyHash });
}

/** One hit against the signed-in reader's own count, with the three answers kept apart. */
export function hitSelfState(client: Rpc, bucket: SelfBucket): Promise<LimitState> {
  return ask(client, "rate_limit_self", bucket, { p_bucket: bucket });
}

/** One hit against a keyed bucket. Fails open: true unless the database said the key is over its limit. */
export async function hitKeyed(client: Rpc, bucket: RateBucket, keyHash: string): Promise<boolean> {
  return (await hitKeyedState(client, bucket, keyHash)) !== "limited";
}

/** One hit against the signed-in reader's own count. Fails open: true unless the database said no. */
export async function hitSelf(client: Rpc, bucket: SelfBucket): Promise<boolean> {
  return (await hitSelfState(client, bucket)) !== "limited";
}

/** The key for a bucket: a salted hash, so the table never holds an address. */
export function rateKey(bucket: RateBucket, value: string, salt: string): string {
  return hashWithSalt(`${bucket}:${value.trim().toLowerCase()}`, salt);
}

const PROCESS_SALT = randomUUID();

/**
 * The salt for limiter keys: LEAD_HASH_SALT, as the forms use. If it is
 * missing in production it falls back to a salt made for this server
 * instance. Counts then hold per instance only, and the gap is logged. Used
 * by the limiters that fail open. Sign-in uses signinSalt.
 */
export function limiterSalt(env: Record<string, string | undefined> = process.env): string {
  try {
    return leadSalt(env);
  } catch {
    console.error("rate_limit_salt_missing");
    return PROCESS_SALT;
  }
}

/**
 * The salt for the sign-in counters, or null when there is none to use.
 * In production a missing LEAD_HASH_SALT means the count cannot be shared
 * between server instances, which is "cannot count": sign-in fails closed.
 * Local development and tests get the fixed development salt.
 */
export function signinSalt(env: Record<string, string | undefined> = process.env): string | null {
  try {
    return leadSalt(env);
  } catch {
    console.error("rate_limit_salt_missing");
    return null;
  }
}

// In-memory front limiters, one per instance, slightly looser than the database.
export const signinEmailMemory: RateLimiter = createRateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 });
export const signinIpMemory: RateLimiter = createRateLimiter({ limit: 20, windowMs: 60 * 60 * 1000 });

export interface SigninLimitDeps {
  client: Rpc | null;
  /** Null when no salt can be used (see signinSalt). */
  salt: string | null;
  memory?: { email: RateLimiter; ip: RateLimiter };
  /**
   * Fail closed when the count cannot be read or written. Defaults to true
   * in production. Elsewhere a missing service key or database must not stop
   * a developer signing in, so the memory limit alone decides.
   */
  failClosed?: boolean;
}

/**
 * The sign-in check: per address and per IP. Both are counted on every
 * request, so trying many addresses from one IP still hits the IP limit.
 * The answer is the same whether or not the address has an account.
 *
 * "unavailable" means the count could not be kept: no salt, no service
 * client, or the database did not answer. The form then asks the person to
 * try again in a few minutes and no link is sent.
 */
export async function signinDecision(email: string, ip: string, deps: SigninLimitDeps): Promise<LimitState> {
  const failClosed = deps.failClosed ?? process.env.NODE_ENV === "production";
  if (deps.salt === null) return "unavailable";
  const memory = deps.memory ?? { email: signinEmailMemory, ip: signinIpMemory };
  const emailKey = rateKey("signin_email", email, deps.salt);
  const ipKey = rateKey("signin_ip", ip, deps.salt);
  const memEmail = memory.email.hit(emailKey);
  const memIp = memory.ip.hit(ipKey);
  if (!memEmail || !memIp) return "limited";
  if (!deps.client) {
    if (failClosed) console.error("rate_limit_unavailable", "signin", "no_client");
    return failClosed ? "unavailable" : "allowed";
  }
  const [byIp, byEmail] = await Promise.all([hitKeyedState(deps.client, "signin_ip", ipKey), hitKeyedState(deps.client, "signin_email", emailKey)]);
  if (byIp === "limited" || byEmail === "limited") return "limited";
  if (byIp === "unavailable" || byEmail === "unavailable") return failClosed ? "unavailable" : "allowed";
  return "allowed";
}

/** True only when sign-in may go ahead. */
export async function signinAllowed(email: string, ip: string, deps: SigninLimitDeps): Promise<boolean> {
  return (await signinDecision(email, ip, deps)) === "allowed";
}

/**
 * Analytics counts (review M5): /api/event and the signed-out funnel counts.
 * Per IP hash, in memory, generous, and fail open: these are daily totals,
 * not a gate, so a limiter fault must never stop a page. The aim is only
 * that one address cannot inflate the counts or turn each request into a
 * database write without end. An unknown address is not limited, because
 * every such visitor would share one count.
 */
export const eventIpMemory: RateLimiter = createRateLimiter({ limit: 300, windowMs: 10 * 60 * 1000 });
export const funnelAnonIpMemory: RateLimiter = createRateLimiter({ limit: 600, windowMs: 10 * 60 * 1000 });

export function eventAllowed(kind: "event" | "funnel_anon", ip: string, memory?: RateLimiter): boolean {
  try {
    if (!ip || ip === "unknown") return true;
    const limiter = memory ?? (kind === "event" ? eventIpMemory : funnelAnonIpMemory);
    return limiter.hit(hashWithSalt(`${kind}:${ip}`, PROCESS_SALT));
  } catch {
    return true;
  }
}
