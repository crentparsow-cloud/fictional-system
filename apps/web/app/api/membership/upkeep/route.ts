import { NextResponse, type NextRequest } from "next/server";
import { sendGiftReceived, sendStudentEnded, sendStudentRecheck } from "@/lib/conversion-mail";
import { cronAuthorised } from "@/lib/cron-auth";
import { reportOps } from "@/lib/ops-alerts";
import { getStripe } from "@/lib/stripe";
import { discountIsCoupon, studentCouponId, studentPercentFrom } from "@/lib/student";
import { createAdminClient } from "@/lib/supabase/admin";
import { runUpkeep, type StudentDueRow, type UndeliveredGift } from "@/lib/upkeep";

/**
 * Daily conversion upkeep. Runs once a day.
 *
 *   GET or POST /api/membership/upkeep
 *   Authorization: Bearer <CRON_SECRET>   (Vercel Cron sends this itself)
 *   -> counts (lib/upkeep.ts)
 *
 * Refreshes the social proof counts, ends gifts that have run out, clears unclaimed ones, re-sends the claim
 * email for a paid gift that never got one, and handles the yearly student
 * re-check (a reminder a month before, the discount off the subscription at
 * the end). The student part does nothing while STRIPE_COUPON_STUDENT is
 * blank.
 *
 * With CRON_SECRET unset the route does nothing and says so. Addresses and
 * ids are never logged or returned, only counts.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

class SqlError extends Error {
  constructor(public code: string | undefined) {
    super("sql_failed");
  }
}

type GiftRow = {
  id: string;
  months: number;
  recipient_email: string;
  recipient_name: string | null;
  sender_name: string | null;
  message: string | null;
  claim_token: string;
  claim_by: string | null;
};

async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });
  if (!cronAuthorised(request.headers, secret)) return NextResponse.json({ error: "unauthorised" }, { status: 401, headers: NO_STORE });

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });
  }

  const coupon = studentCouponId();
  try {
    const { data: cfg } = await admin.from("app_config").select("key, value").eq("key", "student_discount_percent");
    const percent = studentPercentFrom((cfg ?? []) as { key: string; value: unknown }[]);
    const counts = await runUpkeep({
      studentOn: coupon !== null,
      percent,
      async refreshProof() {
        const { data, error } = await admin.rpc("refresh_social_proof");
        if (error) throw new SqlError(error.code);
        return Number(data ?? 0);
      },
      async expireGifts() {
        const { data, error } = await admin.rpc("gifts_expire");
        if (error) throw new SqlError(error.code);
        const r = (data ?? {}) as { ended?: number; unclaimed?: number };
        return { ended: Number(r.ended ?? 0), unclaimed: Number(r.unclaimed ?? 0) };
      },
      async undeliveredGifts() {
        // Paid more than 15 minutes ago, so the webhook has had its go.
        const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
        const { data, error } = await admin
          .from("gift_memberships")
          .select("id, months, recipient_email, recipient_name, sender_name, message, claim_token, claim_by")
          .eq("status", "paid")
          .is("delivered_at", null)
          .not("claim_token", "is", null)
          .not("recipient_email", "is", null)
          .lt("paid_at", cutoff)
          .limit(50);
        if (error) throw new SqlError(error.code);
        return ((data ?? []) as GiftRow[]).map(
          (g): UndeliveredGift => ({ id: g.id, months: g.months, recipientEmail: g.recipient_email, recipientName: g.recipient_name, senderName: g.sender_name, message: g.message, token: g.claim_token, claimBy: g.claim_by }),
        );
      },
      sendGift: (g) => sendGiftReceived({ id: g.id, months: g.months, recipientEmail: g.recipientEmail, recipientName: g.recipientName, senderName: g.senderName, message: g.message, token: g.token, claimBy: g.claimBy }),
      async markGiftDelivered(id) {
        const { error } = await admin.rpc("gift_mark_delivered", { p_id: id });
        if (error) throw new SqlError(error.code);
      },
      async studentDue() {
        const { data, error } = await admin.rpc("student_due", { p_now: new Date().toISOString() });
        if (error) throw new SqlError(error.code);
        return ((data ?? []) as { user_id: string; email: string; expires_at: string; due: "recheck" | "expired" }[]).map(
          (r): StudentDueRow => ({ userId: r.user_id, email: r.email, expiresAt: r.expires_at, due: r.due }),
        );
      },
      sendRecheck: (s, p) => sendStudentRecheck({ email: s.email, userId: s.userId, endsAt: s.expiresAt, percent: p }),
      async removeDiscount(userId) {
        if (!coupon) return;
        const { data: subs, error } = await admin
          .from("subscriptions")
          .select("stripe_subscription_id")
          .eq("user_id", userId)
          .in("status", ["active", "trialing", "past_due"]);
        if (error) throw new SqlError(error.code);
        const stripe = getStripe();
        for (const row of (subs ?? []) as { stripe_subscription_id: string }[]) {
          const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id, { expand: ["discounts"] });
          const any = sub as unknown as { discount?: unknown; discounts?: unknown[] };
          const carries = discountIsCoupon(any.discount, coupon) || (any.discounts ?? []).some((d) => discountIsCoupon(d, coupon));
          // Only a subscription that carries the student coupon is touched.
          if (carries) await stripe.subscriptions.update(row.stripe_subscription_id, { discounts: "" } as unknown as Parameters<typeof stripe.subscriptions.update>[1]);
        }
      },
      sendEnded: (s) => sendStudentEnded({ email: s.email, userId: s.userId, endedOn: s.expiresAt }),
      async markStudent(userId, what) {
        const { error } = await admin.rpc("student_mark", { p_user: userId, p_what: what });
        if (error) throw new SqlError(error.code);
      },
    });
    if (counts.gifts_failed || counts.student_failed) await reportOps(admin, "email_failure", "api/membership/upkeep", "item_failed");
    return NextResponse.json(counts, { headers: NO_STORE });
  } catch (err) {
    console.error("conversion_upkeep_failed", err instanceof SqlError ? err.code : "unknown");
    await reportOps(admin, "cron_failure", "api/membership/upkeep", err instanceof SqlError ? (err.code ?? "unknown") : "unknown");
    return NextResponse.json({ error: "upkeep_failed" }, { status: 500, headers: NO_STORE });
  }
}

export const GET = run;
export const POST = run;
