import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Finishes account deletions whose 7-day undo has passed (F-025).
 *
 *   GET or POST /api/account/complete
 *   Authorization: Bearer <CRON_SECRET>   (Vercel Cron sends this itself)
 *   -> { processed, auth_removed, auth_failed }
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

  const { data, error } = await admin.rpc("complete_due_deletions");
  if (error) {
    console.error("complete_due_deletions_failed", error.code);
    return NextResponse.json({ error: "sql_failed" }, { status: 500, headers: NO_STORE });
  }
  const ids = ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);

  let removed = 0;
  let failed = 0;
  for (const id of ids) {
    const { error: delError } = await admin.auth.admin.deleteUser(id);
    // Already gone (an earlier run removed it and stopped before stamping) counts as done.
    const gone = !delError || delError.status === 404;
    if (!gone) {
      failed += 1;
      continue;
    }
    const { error: markError } = await admin.rpc("mark_auth_removed", { p_user: id });
    if (markError) failed += 1;
    else removed += 1;
  }
  if (failed) console.error("account_auth_removal_failed", failed);

  return NextResponse.json({ processed: ids.length, auth_removed: removed, auth_failed: failed }, { headers: NO_STORE });
}

export const GET = run;
export const POST = run;
