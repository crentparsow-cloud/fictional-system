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
