import { createHash, createHmac, randomInt } from "node:crypto";

/**
 * Akana's own sign-in code for a tenant host (F-133), the pure part.
 *
 * A reader on a tenant's domain never types a Supabase code: that code is
 * good for the whole account, and the tenant controls the page it would be
 * typed on. This code is made here, for one tenant and one address:
 *
 *   - 8 digits from the operating system's random source
 *   - the database keeps only an HMAC of (tenant, address, code). The HMAC
 *     key is derived from TENANT_SESSION_KEYS and never leaves the server,
 *     so a copy of the table cannot be searched for the code
 *   - because the tenant and the address are inside the HMAC, and the row
 *     is keyed by both, a code for tenant A checks out nowhere else
 *
 * Ten minutes, single use and five wrong tries are enforced in the database
 * (public.check_tenant_sign_in_code, migration 0073), in one locked step.
 */
export const TENANT_CODE_DIGITS = 8;
export const TENANT_CODE_TTL_SECONDS = 600;
export const TENANT_CODE_PATTERN = /^\d{8}$/;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lower case and trimmed, or null when it is not an address. */
export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return EMAIL.test(email) && email.length <= 254 ? email : null;
}

/** Eight random digits, leading zeros kept. */
export function newTenantCode(random: (max: number) => number = randomInt): string {
  return String(random(10 ** TENANT_CODE_DIGITS)).padStart(TENANT_CODE_DIGITS, "0");
}

/**
 * The HMAC key, derived from the first key in TENANT_SESSION_KEYS with a
 * label of its own, so the sealing key itself is never used for anything
 * else. Null when the variable is blank: there are then no codes at all.
 */
export function tenantCodeKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  const first = (env.TENANT_SESSION_KEYS ?? "").split(",")[0]?.trim();
  if (!first || !/^v2\.[a-z0-9]{2,16}\.[A-Za-z0-9+/=]+$/.test(first)) return null;
  return createHash("sha256").update(`akana-tenant-sign-in-code:v1:${first}`, "utf8").digest();
}

/** 64 hex characters. The same code hashes differently for another tenant or address. */
export function tenantCodeHash(key: Buffer, tenantId: string, email: string, code: string): string {
  return createHmac("sha256", key).update(`${tenantId.toLowerCase()}\n${email.toLowerCase()}\n${code}`, "utf8").digest("hex");
}
