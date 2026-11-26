/**
 * Bounce and complaint suppression for every mailer (review finding M17).
 *
 * The Resend webhook (app/api/email/resend/route.ts) records a hard bounce
 * or a spam complaint as a salted hash of the address (migration 0076). Each
 * mailer asks here before it sends, and an address on the list is not mailed.
 *
 * While RESEND_WEBHOOK_SECRET is blank the webhook answers 503, so nothing
 * can be on the list: the check says "not suppressed" without a database
 * call. If the lookup itself fails the answer is also "not suppressed". A
 * broken lookup must not stop a receipt or a sign-in email, and the failure
 * is logged with a code. No address is logged.
 *
 * The service role client is loaded only when a lookup is needed, so the
 * mailer modules that import this file stay loadable in unit tests.
 */
type RpcClient = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
};

export type SuppressionOptions = {
  /** Defaults to RESEND_WEBHOOK_SECRET. Blank switches the check off. */
  secret?: string | undefined;
  /** Defaults to the service role client. May throw when it is not configured. */
  client?: () => RpcClient;
};

const REASONS = new Set(["bounced", "complained"]);

export function makeSuppressionCheck(o: SuppressionOptions = {}): (address: string) => Promise<boolean> {
  return async (address) => {
    const secret = "secret" in o ? o.secret : process.env.RESEND_WEBHOOK_SECRET;
    if (!secret || !secret.trim()) return false;
    const to = (address ?? "").trim();
    if (!to) return false;
    let client: RpcClient;
    try {
      client = o.client ? o.client() : ((await import("@/lib/supabase/admin")).createAdminClient() as unknown as RpcClient);
    } catch {
      return false;
    }
    try {
      const { data, error } = await client.rpc("email_suppression_state", { p_email: to });
      if (error) {
        console.error("email_suppression_check_failed", error.code ?? "unknown");
        return false;
      }
      return Array.isArray(data) && data.some((r) => REASONS.has(String((r as { reason?: unknown })?.reason ?? "")));
    } catch {
      console.error("email_suppression_check_failed", "threw");
      return false;
    }
  };
}

/** The check every mailer in the app uses. */
export const isSuppressed: (address: string) => Promise<boolean> = (address) => makeSuppressionCheck()(address);
