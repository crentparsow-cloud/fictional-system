import { NextResponse, type NextRequest } from "next/server";
import { reportOps } from "@/lib/ops-alerts";
import { cronSetup, NO_STORE, SqlError } from "@/lib/today/jobs";
import { planReview, type ReviewEnrolment } from "@/lib/today/review-plan";

/**
 * The daily review candidate list (4.3). For each reader whose programmes
 * feed the review, picks one answer id for the day and keeps it in
 * public.review_queue. The list holds ids only. No answer is opened here:
 * the choice rests on the programme's shape (free-text fields not marked
 * sensitive), the answer rows' field names and dates, and the reader's
 * dials and soft actions. Today unseals the one chosen answer for its owner
 * when they open it.
 *
 *   GET or POST /api/today/review-candidates
 *   Authorization: Bearer <CRON_SECRET>
 *   -> { readers, queued, already_queued, nothing_to_show, failed }
 *
 * Idempotent: a reader with a row for their day is skipped, and the row's
 * key is (programme, day). Today makes the same plan itself if this job has
 * not run, so a missed run costs nothing. Supabase Cron runs this daily
 * (job akana-review-candidates).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface TargetRow {
  enrolment_id: string;
  user_id: string;
  version_id: string;
  safety_tier: "none" | "standard" | "higher";
  review_frequency: string | null;
  timezone: string;
}

async function run(request: NextRequest) {
  const setup = cronSetup(request);
  if (!setup.ok) return setup.response;
  const { admin } = setup;
  const counts = { readers: 0, queued: 0, already_queued: 0, nothing_to_show: 0, failed: 0 };
  try {
    const { data, error } = await admin.rpc("review_targets");
    if (error) throw new SqlError(error.code);
    const byUser = new Map<string, ReviewEnrolment[]>();
    for (const r of (data ?? []) as TargetRow[]) {
      const list = byUser.get(r.user_id) ?? [];
      list.push({ enrolmentId: r.enrolment_id, userId: r.user_id, versionId: r.version_id, safetyTier: r.safety_tier, reviewFrequency: r.review_frequency, timezone: r.timezone });
      byUser.set(r.user_id, list);
    }
    const now = new Date();
    for (const [userId, enrolments] of byUser) {
      counts.readers += 1;
      try {
        const ids = enrolments.map((e) => e.enrolmentId);
        const probe = await planReview(admin, userId, enrolments, now);
        if (!probe) {
          counts.nothing_to_show += 1;
          continue;
        }
        const { count } = await admin.from("review_queue").select("answer_id", { count: "exact", head: true }).in("enrolment_id", ids).eq("for_day", probe.day);
        if ((count ?? 0) > 0) {
          counts.already_queued += 1;
          continue;
        }
        if (!probe.pick) {
          counts.nothing_to_show += 1;
          continue;
        }
        const { error: upErr } = await admin
          .from("review_queue")
          .upsert({ enrolment_id: probe.pick.enrolmentId, for_day: probe.day, answer_id: probe.pick.id }, { onConflict: "enrolment_id,for_day", ignoreDuplicates: true });
        if (upErr) counts.failed += 1;
        else counts.queued += 1;
      } catch {
        counts.failed += 1;
      }
    }
    if (counts.failed) await reportOps(admin, "cron_failure", "api/today/review-candidates", "plan_failed");
    return NextResponse.json(counts, { headers: NO_STORE });
  } catch (err) {
    console.error("today_review_failed", err instanceof SqlError ? err.code : "unknown");
    await reportOps(admin, "cron_failure", "api/today/review-candidates", err instanceof SqlError ? (err.code ?? "sql_failed") : "unknown");
    return NextResponse.json({ error: "failed" }, { status: 500, headers: NO_STORE });
  }
}

export const GET = run;
export const POST = run;
