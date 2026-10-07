import { timingSafeEqual } from "node:crypto";

/**
 * True when a cron request carries CRON_SECRET: as a Bearer token (Vercel
 * Cron sends this itself) or in x-cron-secret. Compared in constant time.
 */
export function cronAuthorised(headers: Pick<Headers, "get">, secret: string): boolean {
  const header = headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : (headers.get("x-cron-secret") ?? "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
