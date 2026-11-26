import "server-only";
import { openGiftLink } from "@/lib/gift-link";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The claim links a buyer may pass on themselves: one per paid, unclaimed
 * gift that they bought. The buyer id comes from the caller's verified
 * session and is the filter here, so nobody gets a link to another person's
 * gift. Returns gift id to token. Empty when anything is not configured.
 */
export async function buyerGiftLinks(buyerId: string, giftIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!buyerId || giftIds.length === 0) return out;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("gift_memberships")
      .select("id, stripe_checkout_session_id")
      .eq("buyer_id", buyerId)
      .eq("status", "paid")
      .in("id", giftIds.slice(0, 20));
    if (error) return out;
    for (const g of (data ?? []) as { id: string; stripe_checkout_session_id: string | null }[]) {
      const token = await openGiftLink(admin, { id: g.id, sessionId: g.stripe_checkout_session_id });
      if (token) out.set(g.id, token);
    }
  } catch {
    // Not configured, or the database is away: the page shows the gifts without links.
  }
  return out;
}
