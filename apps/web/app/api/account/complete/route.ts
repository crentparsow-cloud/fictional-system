import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runDeletionJob, stripeCanceller, type DueSubscription } from "@/lib/account-complete";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Finishes account deletions whose 7-day undo has passed (F-025).
 *
 *   GET or POST /api/account/complete
 *   Authorization: Bearer <CRON_SECRET>   (Vercel Cron sends this itself)
 *   -> { processed, auth_removed, auth_failed, subscriptions_cancelled, subscriptions_failed }
 *
 * Step 0, membership (F-097, migration 0009): any live Stripe subscription
 * of a reader whose deletion is due is cancelled in Stripe at once and
 * recorded as cancelled. If one cannot be cancelled, nothing is deleted this
 * run (502) and the next run tries again; the database refuses to complete
 * a deletion while a live subscription remains. The order and the fakes
 * that test it are in lib/account-complete.ts.
 *
 * Step 1, in SQL: public.complete_due_deletions() deletes the reader's
 * answers, progress, enrolments, entitlements and memberships and clears
 * their profile. It never touches purchases: purchase and tax records are
 * kept for the period tax law requires, unlinked from the person once the
 * auth user is gone (migration 0007 sets purchases.user_id to null on delete).
 *
 * Step 2, here: the auth user is removed with the service role, then the
 * request row is stamped auth_removed_at. A failure is retried on the next
 * run because the SQL function keeps returning that id until it is stamped.
 *
 * With CRON_SECRET unset the route does nothing and says so. Ids are never
 * logged or returned, only counts.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function authorised(request: NextRequest, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : (request.headers.get("x-cron-secret") ?? "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });
  if (!authorised(request, secret)) return NextResponse.json({ error: "unauthorised" }, { status: 401, headers: NO_STORE });

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });
  }

  // Stripe is needed only when a due reader still has a live membership.
  let canceller: ReturnType<typeof stripeCanceller> | null = null;
  const cancelSubscription = async (id: string) => {
    canceller ??= stripeCanceller(getStripe().subscriptions);
    return canceller(id);
  };

  let result;
  try {
    result = await runDeletionJob({
      async dueSubscriptions() {
        const { data, error } = await admin.rpc("due_deletion_subscriptions");
        if (error) throw new SqlError(error.code);
        return (data ?? []) as DueSubscription[];
      },
      cancelSubscription,
      async markSubscriptionCancelled(id) {
        const { error } = await admin.rpc("mark_subscription_cancelled", { p_subscription: id });
        if (error) throw new SqlError(error.code);
      },
      async completeDueDeletions() {
        const { data, error } = await admin.rpc("complete_due_deletions");
        if (error) throw new SqlError(error.code);
        return ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
      },
      async deleteAuthUser(id) {
        const { error } = await admin.auth.admin.deleteUser(id);
        // Already gone (an earlier run removed it and stopped before stamping) counts as done.
        if (!error) return "removed";
        return error.status === 404 ? "gone" : "failed";
      },
      async markAuthRemoved(id) {
        const { error } = await admin.rpc("mark_auth_removed", { p_user: id });
        return !error;
      },
    });
  } catch (err) {
    console.error("complete_due_deletions_failed", err instanceof SqlError ? err.code : "unknown");
    return NextResponse.json({ error: "sql_failed" }, { status: 500, headers: NO_STORE });
  }

  const { status, ...counts } = result;
  if (status === "blocked") {
    console.error("account_subscription_cancel_failed", counts.subscriptions_failed);
    return NextResponse.json({ error: "stripe_cancel_failed", ...counts }, { status: 502, headers: NO_STORE });
  }
  if (counts.auth_failed) console.error("account_auth_removal_failed", counts.auth_failed);
  return NextResponse.json(counts, { headers: NO_STORE });
}

class SqlError extends Error {
  constructor(public code: string | undefined) {
    super("sql_failed");
  }
}

export const GET = run;
export const POST = run;
