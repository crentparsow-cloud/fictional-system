import "server-only";
import { createHash, createHmac } from "node:crypto";

/**
 * Gift claim links without a stored token (review finding L12).
 *
 * The database keeps only a SHA-256 hash of a gift's claim token (migration
 * 0076). The server can still show or resend the link because the token is
 * derived, not stored: HMAC-SHA256 of the Checkout Session id under a server
 * secret, as 43 URL-safe characters.
 *
 * The secret is GIFT_LINK_SECRET. While that is blank the service role key
 * is used as the HMAC key instead, so gifts work with no new setting. The
 * key never leaves the server and an HMAC does not reveal it.
 *
 * A gift bought before 0076 was emailed a random token, and its hash is what
 * the database holds. The derived token for that gift is different, so
 * before the server shows or sends a derived link it registers the hash of
 * it (public.gift_link_register). Both links then open the gift, and the
 * link already sent keeps working. The same step covers a change of secret.
 */
type RpcClient = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
};

export function giftLinkSecret(env: Record<string, string | undefined> = process.env): string | null {
  const own = (env.GIFT_LINK_SECRET ?? "").trim();
  if (own) return own;
  const fallback = (env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  return fallback || null;
}

/** The claim token for a gift, from its Checkout Session id. Always the same for the same secret. */
export function deriveClaimToken(sessionId: string, secret: string): string {
  return createHmac("sha256", secret).update(`akana:gift-claim:v1:${sessionId}`).digest("base64url");
}

/** What the database stores and looks a token up by. */
export function claimTokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * The link token for a paid gift, registered so it opens the gift.
 * Null when there is no secret, the gift is not waiting, or the database refused.
 */
export async function openGiftLink(admin: RpcClient, gift: { id: string; sessionId: string | null | undefined }, secret: string | null = giftLinkSecret()): Promise<string | null> {
  if (!secret || !gift.sessionId) return null;
  const token = deriveClaimToken(gift.sessionId, secret);
  const { data, error } = await admin.rpc("gift_link_register", { p_id: gift.id, p_token_hash: claimTokenHash(token) });
  if (error) {
    console.error("gift_link_register_failed", error.code ?? "unknown");
    return null;
  }
  return data === true ? token : null;
}
