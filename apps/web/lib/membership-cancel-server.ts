import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CancelSubject } from "@/lib/cancel-flow";
import type { StripeSubscriptionsApi } from "@/lib/membership-cancel";
import { getStripe } from "@/lib/stripe";

/**
 * The server pieces of the cancel flow (14.24): the reader's own live
 * subscription as the flow reads it, and the Stripe client as the small
 * interface lib/membership-cancel.ts takes.
 */

export interface SubjectRow {
  stripe_subscription_id: string;
  status: string;
  plan: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  cancel_at: string | null;
  paused_from: string | null;
  paused_until: string | null;
  created_at: string;
  updated_at: string | null;
}

export type FlowSubject = CancelSubject & { createdAt: string; updatedAt: string | null };

export function subjectFromRow(r: SubjectRow): FlowSubject {
  return {
    stripeSubscriptionId: r.stripe_subscription_id,
    status: r.status,
    plan: r.plan,
    currentPeriodEnd: r.current_period_end,
    cancelAtPeriodEnd: r.cancel_at_period_end,
    cancelAt: r.cancel_at,
    pausedFrom: r.paused_from,
    pausedUntil: r.paused_until,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** The reader's own subscription rows on this storefront, newest first. Own rows only, whatever the policy allows staff to see. */
export async function loadSubjects(supabase: SupabaseClient, userId: string, tenantId: string): Promise<FlowSubject[]> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id, status, plan, current_period_end, cancel_at_period_end, cancel_at, paused_from, paused_until, created_at, updated_at")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`subscriptions read failed: ${error.code ?? "unknown"}`);
  return ((data ?? []) as SubjectRow[]).map(subjectFromRow);
}

export function stripeSubscriptions(): StripeSubscriptionsApi {
  const s = getStripe().subscriptions;
  return {
    update: (id, params) => s.update(id, params as Stripe.SubscriptionUpdateParams),
    cancel: (id, params) => s.cancel(id, params as Stripe.SubscriptionCancelParams),
  };
}
