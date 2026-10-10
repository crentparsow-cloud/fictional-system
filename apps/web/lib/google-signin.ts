/**
 * Google One Tap (13.1), the pure part. Shared by the client component and
 * the POST /auth/google handler. Nothing here touches Supabase.
 *
 * The nonce: the client mints a random value, gives Google its SHA-256 hex
 * digest, and sends the raw value to the server with the ID token. Supabase
 * hashes the raw value the same way and refuses a token whose nonce claim
 * does not match, so a token minted for one submission cannot be swapped
 * into another. This is the flow Supabase documents for One Tap.
 */

export const GOOGLE_GSI_SCRIPT = "https://accounts.google.com/gsi/client";
export const GOOGLE_SIGNIN_PATH = "/auth/google";

/** The client id, or null while the variable is blank (One Tap then renders nothing). */
export function googleClientId(env: Record<string, string | undefined> = process.env): string | null {
  const id = env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  return id ? id : null;
}

/** 32 random bytes as hex, from the Web Crypto API (browser and Node 20+). */
export function newNonce(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return hex(bytes);
}

/** SHA-256 of the nonce as lower-case hex, the form Google puts in the token. */
export async function hashNonce(nonce: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce));
  return hex(new Uint8Array(digest));
}

function hex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/** A Google ID token is a JWT: three base64url parts. Length is capped so the handler never forwards junk. */
export function looksLikeIdToken(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 4096 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}

/** The nonce the client minted: 64 hex characters. */
export function looksLikeNonce(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

/**
 * Login CSRF guard for the POST: the form must have been submitted from this
 * site. Browsers send Sec-Fetch-Site on same-origin form posts; older ones
 * send Origin. Either is accepted; neither present, or a cross-site value,
 * is refused.
 */
export function postedFromThisSite(headers: { get(name: string): string | null }, host: string | null): boolean {
  const site = headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = headers.get("origin");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
