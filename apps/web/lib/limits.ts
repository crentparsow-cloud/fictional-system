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
 * Fail open: if the database cannot be asked, the request goes ahead and the
 * failure is logged. A limiter outage must never lock readers out of signing
 * in or out of their own answers. Only an explicit false means "limited".
 *
 * The one exception is asking for a sign-in code on a tenant host (F-133,
 * R2-5): tenantSigninAllowed below fails closed. Each code there buys five
 * guesses and sends an email, so a request that cannot be counted is
 * refused. The Akana site's own sign-in is unchanged.
 */
export type RateBucket = "signin_email" | "signin_ip" | "checkout_user" | "export_user" | "partner_respond_ip";
export type SelfBucket = Extract<RateBucket, "checkout_user" | "export_user">;

type Rpc = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string } | null }> };

export const CHECKOUT_BUSY_MESSAGE = "You have started checkout several times in the last hour. Please wait a few minutes and try again.";
export const EXPORT_BUSY_MESSAGE = "You have downloaded your work several times in the last hour. Please try again later. Your work is safe.";

/** One hit against a keyed bucket. True unless the database said the key is over its limit. */
export async function hitKeyed(client: Rpc, bucket: RateBucket, keyHash: string): Promise<boolean> {
  try {
    const { data, error } = await client.rpc("rate_limit_hit", { p_bucket: bucket, p_key_hash: keyHash });
    if (error) {
      console.error("rate_limit_unavailable", bucket, error.code ?? "");
      return true;
    }
    return data !== false;
  } catch (e) {
    console.error("rate_limit_unavailable", bucket, e instanceof Error ? e.name : "unknown");
    return true;
  }
}

/** One hit against the signed-in reader's own count. True unless the database said no. */
export async function hitSelf(client: Rpc, bucket: SelfBucket): Promise<boolean> {
  try {
    const { data, error } = await client.rpc("rate_limit_self", { p_bucket: bucket });
    if (error) {
      console.error("rate_limit_unavailable", bucket, error.code ?? "");
      return true;
    }
    return data !== false;
  } catch (e) {
    console.error("rate_limit_unavailable", bucket, e instanceof Error ? e.name : "unknown");
    return true;
  }
}

/** The key for a bucket: a salted hash, so the table never holds an address. */
export function rateKey(bucket: RateBucket, value: string, salt: string): string {
  return hashWithSalt(`${bucket}:${value.trim().toLowerCase()}`, salt);
}

const PROCESS_SALT = randomUUID();

/**
 * The salt for limiter keys: LEAD_HASH_SALT, as the forms use. If it is
 * missing in production the limiter must not break sign-in, so it falls back
 * to a salt made for this server instance. Counts then hold per instance
 * only, and the gap is logged.
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
 * The salt for the tenant code path: LEAD_HASH_SALT or nothing. There is no
 * per-instance stand-in here, because a key that differs on every server
 * instance counts nothing across them.
 */
export function strictLimiterSalt(env: Record<string, string | undefined> = process.env): string | null {
  try {
    return leadSalt(env);
  } catch {
    console.error("rate_limit_salt_missing");
    return null;
  }
}

/** One hit, fail closed: true only when the database counted it and said yes. */
export async function hitKeyedStrict(client: Rpc, bucket: RateBucket, keyHash: string): Promise<boolean> {
  try {
    const { data, error } = await client.rpc("rate_limit_hit", { p_bucket: bucket, p_key_hash: keyHash });
    if (error) {
      console.error("rate_limit_unavailable_closed", bucket, error.code ?? "");
      return false;
    }
    return data === true;
  } catch (e) {
    console.error("rate_limit_unavailable_closed", bucket, e instanceof Error ? e.name : "unknown");
    return false;
  }
}

// In-memory front limiters, one per instance, slightly looser than the database.
export const signinEmailMemory: RateLimiter = createRateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 });
export const signinIpMemory: RateLimiter = createRateLimiter({ limit: 20, windowMs: 60 * 60 * 1000 });

export interface SigninLimitDeps {
  client: Rpc | null;
  salt: string;
  memory?: { email: RateLimiter; ip: RateLimiter };
}

/**
 * The sign-in check: per address and per IP. Both are counted on every
 * request, so trying many addresses from one IP still hits the IP limit.
 * The answer is the same whether or not the address has an account.
 */
export async function signinAllowed(email: string, ip: string, deps: SigninLimitDeps): Promise<boolean> {
  const memory = deps.memory ?? { email: signinEmailMemory, ip: signinIpMemory };
  const emailKey = rateKey("signin_email", email, deps.salt);
  const ipKey = rateKey("signin_ip", ip, deps.salt);
  const memEmail = memory.email.hit(emailKey);
  const memIp = memory.ip.hit(ipKey);
  if (!memEmail || !memIp) return false;
  if (!deps.client) return true;
  const [byIp, byEmail] = await Promise.all([hitKeyed(deps.client, "signin_ip", ipKey), hitKeyed(deps.client, "signin_email", emailKey)]);
  return byIp && byEmail;
}

export interface TenantSigninLimitDeps {
  client: Rpc | null;
  /** From strictLimiterSalt: null when LEAD_HASH_SALT is missing. */
  salt: string | null;
  memory?: { email: RateLimiter; ip: RateLimiter };
}

/**
 * The check before a sign-in code is issued on a tenant host. The same
 * buckets and limits as signinAllowed, but fail closed: with no salt, no
 * database client, or a counter that errors, the answer is no. The database
 * also bounds codes per tenant and address by itself
 * (public.issue_tenant_sign_in_code, migration 0073), so this is the front
 * check and the per-IP limit, not the only bound.
 */
export async function tenantSigninAllowed(email: string, ip: string, deps: TenantSigninLimitDeps): Promise<boolean> {
  if (!deps.salt || !deps.client) {
    console.error("rate_limit_unavailable_closed", "tenant_signin", deps.salt ? "no_client" : "no_salt");
    return false;
  }
  const memory = deps.memory ?? { email: signinEmailMemory, ip: signinIpMemory };
  const emailKey = rateKey("signin_email", email, deps.salt);
  const ipKey = rateKey("signin_ip", ip, deps.salt);
  const memEmail = memory.email.hit(emailKey);
  const memIp = memory.ip.hit(ipKey);
  if (!memEmail || !memIp) return false;
  const [byIp, byEmail] = await Promise.all([hitKeyedStrict(deps.client, "signin_ip", ipKey), hitKeyedStrict(deps.client, "signin_email", emailKey)]);
  return byIp && byEmail;
}
