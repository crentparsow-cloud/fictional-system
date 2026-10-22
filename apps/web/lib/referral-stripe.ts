import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import type { GrowthContext } from "@/lib/growth-webhook";
import { extendedTrialEnd } from "@/lib/referral-reward";

/**
 * The real Stripe and database steps behind lib/referral-reward.ts and
 * lib/growth-webhook.ts. Every Stripe write carries an idempotency key made
 * from the referral or credit id, so a retried webhook cannot give a reward
 * twice. Descriptions never name a workbook.
 */
export function growthContext(admin: SupabaseClient, stripe: Stripe): GrowthContext {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await admin.rpc(name, args);
    return { data, error: error ? { code: error.code, message: error.message } : null };
  }
  function must<T>(name: string, r: { data: T; error: { code?: string; message?: string } | null }): T {
    if (r.error) throw new Error(`${name} failed: ${r.error.code ?? "unknown"}`);
    return r.data;
  }
  async function addCredit(a: { customerId: string; amountMinor: number; currency: string; key: string }): Promise<string> {
    // A negative customer balance reduces the next invoice. It cannot be withdrawn.
    const txn = await stripe.customers.createBalanceTransaction(
      a.customerId,
      { amount: -Math.abs(a.amountMinor), currency: a.currency.toLowerCase(), description: "Akana referral credit" },
      { idempotencyKey: a.key },
    );
    return txn.id;
  }

  return {
    db: {
      rpc,
      async subscription(id) {
        const { data, error } = await admin.from("subscriptions").select("user_id, stripe_customer_id").eq("stripe_subscription_id", id).maybeSingle();
        if (error) throw new Error(`subscription lookup failed: ${error.code ?? "unknown"}`);
        const row = data as { user_id: string; stripe_customer_id: string } | null;
        return row ? { userId: row.user_id, customerId: row.stripe_customer_id } : null;
      },
    },
    reward: {
      async pendingReferrer(friendId) {
        const { data, error } = await admin.from("referrals").select("referrer_id").eq("referred_id", friendId).in("status", ["pending", "rewarding"]).maybeSingle();
        if (error) throw new Error(`referral lookup failed: ${error.code ?? "unknown"}`);
        return (data as { referrer_id: string } | null)?.referrer_id ?? null;
      },
      async paymentFingerprint(invoiceId) {
        try {
          const list = await stripe.invoicePayments.list({ invoice: invoiceId, limit: 5 });
          for (const p of list.data) {
            if (p.status !== "paid") continue;
            const ref = p.payment?.payment_intent;
            const id = ref ? (typeof ref === "string" ? ref : ref.id) : null;
            if (!id) continue;
            const pi = await stripe.paymentIntents.retrieve(id, { expand: ["payment_method"] });
            const pm = pi.payment_method && typeof pi.payment_method === "object" ? pi.payment_method : null;
            return pm?.card?.fingerprint ?? null;
          }
          return null;
        } catch (err) {
          // Unknown is not the same as no card: stop and let Stripe retry the event.
          throw new Error(`fingerprint lookup failed: ${err instanceof Error ? err.name : "unknown"}`);
        }
      },
      async referrerState(referrerId) {
        const { data, error } = await admin
          .from("subscriptions")
          .select("stripe_customer_id, stripe_subscription_id, status, updated_at")
          .eq("user_id", referrerId)
          .order("updated_at", { ascending: false })
          .limit(1);
        if (error) throw new Error(`referrer lookup failed: ${error.code ?? "unknown"}`);
        const row = ((data ?? []) as { stripe_customer_id: string; stripe_subscription_id: string; status: string }[])[0];
        if (!row) return { customerId: null, subscriptionId: null, trialing: false, trialEnd: null };
        let trialing = false;
        let trialEnd: number | null = null;
        if (row.status === "trialing") {
          // Stripe is the truth: the row may be a moment behind.
          const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
          trialing = sub.status === "trialing";
          trialEnd = sub.trial_end ?? null;
        }
        return { customerId: row.stripe_customer_id, subscriptionId: row.stripe_subscription_id, trialing, trialEnd };
      },
      async customerFingerprints(customerId) {
        const list = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 20 });
        return list.data.map((m) => m.card?.fingerprint).filter((f): f is string => typeof f === "string");
      },
      async claim(a) {
        const { data, error } = await admin.rpc("referral_claim_reward", {
          p_referred: a.friendId,
          p_fingerprint: a.fingerprint,
          p_referrer_fingerprints: a.referrerFingerprints,
          p_referrer_trialing: a.referrerTrialing,
          p_currency: a.currency,
        });
        if (error) throw new Error(`referral_claim_reward failed: ${error.code ?? "unknown"}`);
        const row = ((data ?? []) as { referral_id: string; referrer_id: string; reward_kind: "credit" | "trial_days"; reward_value: number; reward_currency: string | null }[])[0];
        return row ? { referralId: row.referral_id, referrerId: row.referrer_id, kind: row.reward_kind, value: row.reward_value, currency: row.reward_currency } : null;
      },
      addCredit,
      async extendTrial(a) {
        await stripe.subscriptions.update(
          a.subscriptionId,
          { trial_end: extendedTrialEnd(a.currentTrialEnd, a.days), proration_behavior: "none" },
          { idempotencyKey: a.key },
        );
      },
      async rewardGiven(referralId, balanceTxnId) {
        must("referral_reward_given", await rpc("referral_reward_given", { p_referral: referralId, p_balance_txn: balanceTxnId }));
      },
      async creditApplied(creditId, balanceTxnId) {
        must("credit_applied", await rpc("credit_applied", { p_credit: creditId, p_balance_txn: balanceTxnId }));
      },
    },
  };
}
