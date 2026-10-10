import { createHash, randomBytes } from "node:crypto";

/**
 * The invitation token for a shared membership (item 6.1, migration 0041).
 * Used by server code only (it needs node:crypto). The token is made on the
 * server and only its sha256 hash is stored, so a database read never
 * yields a working link. The words and offers live in lib/shared-membership.ts,
 * which the browser can load.
 */

const TOKEN = /^[A-Za-z0-9_-]{32}$/;

/** 24 random bytes as 32 URL-safe characters. */
export function newInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

export function isInviteToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN.test(value);
}

/** sha256 as 64 lower-case hex characters: what the database stores and compares. */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** The link the buyer copies or shares. The token sits in the path so a mail client keeps it whole. */
export function inviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/share/${token}`;
}
