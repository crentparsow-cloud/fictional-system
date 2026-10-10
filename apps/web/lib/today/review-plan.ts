import type { SupabaseClient } from "@supabase/supabase-js";
import { localParts } from "@/lib/today/reminders";
import {
  effectiveFrequency,
  isReviewFrequency,
  pickFallbacks,
  pickForDay,
  reviewCandidates,
  reviewableFields,
  REST_DAYS,
  type AnswerRef,
  type ReviewFrequency,
} from "@/lib/today/review";
import { stepsFromUnitSections } from "@/lib/today/steps";

/**
 * Works out which answer ids could come back on Today, without opening any
 * answer. It reads the programme's shape (which fields are free text and not
 * marked sensitive), the answer rows' field names and dates, the reader's
 * soft actions and what was shown lately. The sealed column is never
 * selected. Used by Today (with the reader's own client) and by the daily
 * job (with the service role).
 */

export interface ReviewEnrolment {
  enrolmentId: string;
  userId: string;
  versionId: string;
  safetyTier: "none" | "standard" | "higher";
  /** The reader's choice, or null for the default by tier. */
  reviewFrequency: string | null;
  timezone: string;
}

export interface ReviewPlan {
  day: string;
  pick: AnswerRef | null;
  fallbacks: AnswerRef[];
  /** Field path to the question label, per enrolment version, for the chosen answers. */
  labels: Map<string, { label: string; unit: number }>;
}

const chunk = <T,>(xs: readonly T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

export async function planReview(client: SupabaseClient, userId: string, enrolments: readonly ReviewEnrolment[], now: Date): Promise<ReviewPlan | null> {
  const mine = enrolments.filter((e) => e.userId === userId);
  const resolved = mine.map((e) => ({ e, frequency: effectiveFrequency(isReviewFrequency(e.reviewFrequency) ? (e.reviewFrequency as ReviewFrequency) : null, e.safetyTier) }));
  const active = resolved.filter((r) => r.frequency !== "off");
  if (!active.length) return null;
  const tz = active[0]?.e.timezone ?? "Europe/London";
  const day = localParts(now, tz).date;

  const versionIds = [...new Set(active.map((r) => r.e.versionId))];
  const { data: sections, error: secErr } = await client.from("workbook_sections").select("version_id, unit_number, body").eq("kind", "unit").in("version_id", versionIds);
  if (secErr) throw new Error("review_sections_failed");
  const byVersion = new Map<string, { unit_number: number | null; body: unknown }[]>();
  for (const s of (sections ?? []) as { version_id: string; unit_number: number | null; body: unknown }[]) {
    const list = byVersion.get(s.version_id) ?? [];
    list.push(s);
    byVersion.set(s.version_id, list);
  }
  const labels = new Map<string, { label: string; unit: number }>();
  const programmes = active.map((r) => {
    const reviewable = reviewableFields(stepsFromUnitSections(byVersion.get(r.e.versionId) ?? []));
    for (const [field, v] of reviewable) labels.set(`${r.e.enrolmentId}|${field}`, v);
    return { enrolmentId: r.e.enrolmentId, frequency: r.frequency, reviewable };
  });

  const ids = active.map((r) => r.e.enrolmentId);
  const answers: AnswerRef[] = [];
  for (const part of chunk(ids, 50)) {
    const { data, error } = await client.from("answers").select("id, enrolment_id, field, updated_at").in("enrolment_id", part).limit(5000);
    if (error) throw new Error("review_answers_failed");
    for (const a of (data ?? []) as { id: string; enrolment_id: string; field: string; updated_at: string }[]) {
      answers.push({ id: a.id, enrolmentId: a.enrolment_id, field: a.field, updatedAt: a.updated_at });
    }
  }

  const { data: marks } = await client.from("review_marks").select("answer_id, state").in("enrolment_id", ids).eq("state", "set_aside").limit(5000);
  const setAside = new Set(((marks ?? []) as { answer_id: string }[]).map((m) => m.answer_id));
  const since = new Date(now.getTime() - REST_DAYS * 86_400_000).toISOString().slice(0, 10);
  const { data: shown } = await client.from("review_queue").select("answer_id").in("enrolment_id", ids).gte("for_day", since).limit(5000);
  const recentlyShown = new Set(((shown ?? []) as { answer_id: string }[]).map((m) => m.answer_id));

  const candidates = reviewCandidates({ userId, day, now, programmes, answers, setAside, recentlyShown });
  const pick = pickForDay(candidates, userId, day);
  return { day, pick, fallbacks: pickFallbacks(candidates, pick), labels };
}

/** The question text for one answer's field, from the programme's shape. Null if the field may not come back. */
export async function fieldLabel(client: SupabaseClient, versionId: string, field: string): Promise<string | null> {
  const { data } = await client.from("workbook_sections").select("unit_number, body").eq("kind", "unit").eq("version_id", versionId);
  const reviewable = reviewableFields(stepsFromUnitSections((data ?? []) as { unit_number: number | null; body: unknown }[]));
  return reviewable.get(field)?.label ?? null;
}
