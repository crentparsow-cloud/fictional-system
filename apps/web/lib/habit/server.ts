import "server-only";
import { unseal } from "@/lib/answers";
import { myEnrolments } from "@/lib/catalogue";
import type { ContinueCard } from "@/lib/catalogue-types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import { MARKETPLACE_TENANT_ID } from "@/lib/tenant";
import { companionStage, companionWords, effectiveSteps, growthLine, parseStageSteps, type CompanionStage, type CompanionWords } from "@/lib/habit/companion";
import { marksView, type MarkRow, type MarkView } from "@/lib/habit/milestones";
import { anniversaryDays, labelFor, orderCandidates } from "@/lib/habit/on-this-day";
import { DEFAULT_MAX_GOAL, DEFAULT_OFFER_AFTER_STEPS, DEFAULT_PAUSE_DAYS, runLine, shouldOfferRun, summariseRun, type RunSummary, type StepDay } from "@/lib/habit/run";
import { localMidnightUtc, monthStartUtc, nextDate } from "@/lib/habit/time";
import { countIsCurrent, wordsIn, wordsLine } from "@/lib/habit/words";
import { gapDue } from "@/lib/today/gap";
import { localParts } from "@/lib/today/reminders";
import { fieldLabel } from "@/lib/today/review-plan";
import { effectiveFrequency, isReviewFrequency, reviewText, type ReviewFrequency } from "@/lib/today/review";

/**
 * Everything the habit features read, worked out on the server under the
 * reader's own client (row level security decides what is readable).
 *
 * The daily run is only ever read through public.habit_step_days, which the
 * database restricts to tier 'none' titles and to readers who switched it on
 * (migration 0049). This file adds no second path to that data.
 *
 * Reader answers stay sealed. The only places text is opened are "On this
 * day" (one answer, for its owner, shown to them) and the word count (opened
 * to count, then dropped; only the number is kept).
 */

type UserClient = Awaited<ReturnType<typeof createUserClient>>;

export interface HabitConfig {
  offerAfter: number;
  pauseDays: number;
  maxGoal: number;
  stageSteps: readonly number[];
}

export interface HabitSettingsRow {
  daily_run_on: boolean;
  daily_goal: number;
  offer_declined_at: string | null;
  companion_on: boolean | null;
  usual_time_on: boolean;
  companion_high_water: number;
}

export interface CompanionView {
  stage: CompanionStage;
  growth: string;
  words: CompanionWords;
  steps: number;
}

export interface HabitView {
  timeZone: string;
  config: HabitConfig;
  settings: HabitSettingsRow;
  /** True when the reader has any title on the standard or higher tier. */
  hasWellbeingTitle: boolean;
  eligibleSteps: number;
  offer: boolean;
  run: (RunSummary & { line: string }) | null;
  companionOn: boolean;
  companion: CompanionView | null;
  marks: MarkView[];
  /** The reader's usual time to finish a step as HH:MM, or null until there is enough history. */
  usualTime: string | null;
}

const DEFAULT_SETTINGS: HabitSettingsRow = { daily_run_on: false, daily_goal: 1, offer_declined_at: null, companion_on: null, usual_time_on: false, companion_high_water: 0 };

async function loadConfig(supabase: UserClient): Promise<HabitConfig> {
  const keys = ["habit_offer_after_steps", "habit_pause_days", "habit_max_goal", "companion_stage_steps"];
  const { data } = await supabase.from("app_config").select("key, value").in("key", keys);
  const m = new Map(((data ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
  const num = (k: string, fb: number, min = 0) => {
    const n = Number(m.get(k));
    return Number.isFinite(n) && n >= min ? Math.floor(n) : fb;
  };
  return {
    offerAfter: num("habit_offer_after_steps", DEFAULT_OFFER_AFTER_STEPS, 1),
    pauseDays: num("habit_pause_days", DEFAULT_PAUSE_DAYS, 0),
    maxGoal: num("habit_max_goal", DEFAULT_MAX_GOAL, 1),
    stageSteps: parseStageSteps(m.get("companion_stage_steps")),
  };
}

export async function readerTimeZone(supabase: UserClient): Promise<string> {
  const { data } = await supabase.from("today_settings").select("timezone").limit(1);
  return (data as { timezone?: string }[] | null)?.[0]?.timezone ?? "Europe/London";
}

function hhmm(t: unknown): string | null {
  return typeof t === "string" && /^\d{2}:\d{2}/.test(t) ? t.slice(0, 5) : null;
}

export async function loadHabit(userId: string, now: Date = new Date()): Promise<HabitView> {
  const supabase = await createUserClient();
  const [config, cards, tz] = await Promise.all([loadConfig(supabase), myEnrolments(userId).catch(() => [] as ContinueCard[]), readerTimeZone(supabase)]);
  const hasWellbeingTitle = cards.some((c) => c.safetyTier !== "none");

  // Marks first: awarding is cheap, safe to repeat, and the read below then includes anything new.
  await supabase.rpc("award_milestones");
  const [{ data: settingsRow }, eligible, { data: markRows }, usual] = await Promise.all([
    supabase.from("habit_settings").select("daily_run_on, daily_goal, offer_declined_at, companion_on, usual_time_on, companion_high_water").eq("user_id", userId).maybeSingle(),
    supabase.rpc("habit_none_tier_steps"),
    supabase.from("milestone_marks").select("id, kind, earned_at, seen_at").eq("user_id", userId),
    supabase.rpc("my_usual_step_time", { p_tz: tz }),
  ]);
  const settings = (settingsRow as HabitSettingsRow | null) ?? DEFAULT_SETTINGS;
  const eligibleSteps = typeof eligible.data === "number" ? eligible.data : 0;

  let run: HabitView["run"] = null;
  if (settings.daily_run_on) {
    const { data } = await supabase.rpc("habit_step_days", { p_tz: tz });
    const days: StepDay[] = ((data ?? []) as { step_day: string; step_count: number }[]).map((r) => ({ day: r.step_day, steps: r.step_count }));
    const summary = summariseRun(days, localParts(now, tz).date, settings.daily_goal, config.pauseDays);
    run = { ...summary, line: runLine(summary) };
  }

  const companionOn = settings.companion_on ?? !hasWellbeingTitle;
  let companion: CompanionView | null = null;
  if (companionOn && cards.length > 0) {
    const { data } = await supabase.rpc("companion_state");
    const row = ((data ?? []) as { steps: number; high_water: number }[])[0];
    if (row) {
      const steps = effectiveSteps(row.steps, row.high_water);
      const stage = companionStage(steps, config.stageSteps);
      const newest = cards.reduce((a, c) => (c.lastOpenedAt > a ? c.lastOpenedAt : a), "");
      const returning = newest ? gapDue(new Date(newest), now) : false;
      companion = { stage, growth: growthLine(stage), steps, words: companionWords(`${userId}|${localParts(now, tz).date}`, { returning }) };
    }
  }

  return {
    timeZone: tz,
    config,
    settings,
    hasWellbeingTitle,
    eligibleSteps,
    offer: shouldOfferRun({ eligibleSteps, offerAfter: config.offerAfter, runOn: settings.daily_run_on, declined: settings.offer_declined_at !== null }),
    run,
    companionOn,
    companion,
    marks: marksView((markRows ?? []) as MarkRow[]),
    usualTime: hhmm(usual.data),
  };
}

// ---------------------------------------------------------------------------
// On this day
// ---------------------------------------------------------------------------

export interface OnThisDayView {
  answerId: string;
  label: string;
  question: string;
  text: string;
}

interface EnrolRow {
  id: string;
  version_id: string;
  tenant_id: string;
}

/**
 * One earlier answer of the reader's own, written on the same day of the
 * month one, three or six months ago, or one or two years ago. Only for a
 * programme whose daily review is not off (wellbeing titles are off until
 * the reader turns it on), never an answer the reader set aside, and never
 * the answer already shown as today's review.
 */
export async function loadOnThisDay(userId: string, now: Date = new Date(), excludeAnswerId?: string): Promise<OnThisDayView | null> {
  const supabase = await createUserClient();
  const cards = await myEnrolments(userId);
  if (cards.length === 0) return null;
  const tz = await readerTimeZone(supabase);
  const ids = cards.map((c) => c.enrolmentId);
  const { data: settings } = await supabase.from("today_settings").select("enrolment_id, review_frequency").in("enrolment_id", ids);
  const freqOf = new Map(((settings ?? []) as { enrolment_id: string; review_frequency: string | null }[]).map((s) => [s.enrolment_id, s.review_frequency]));
  const allowed = cards.filter((c) => {
    const f = freqOf.get(c.enrolmentId);
    return effectiveFrequency(isReviewFrequency(f) ? (f as ReviewFrequency) : null, c.safetyTier) !== "off";
  });
  if (allowed.length === 0) return null;

  const today = localParts(now, tz).date;
  const days = anniversaryDays(today);
  const ranges = days.map((d) => `and(updated_at.gte.${localMidnightUtc(d.date, tz).toISOString()},updated_at.lt.${localMidnightUtc(nextDate(d.date), tz).toISOString()})`);
  const { data: rows } = await supabase
    .from("answers")
    .select("id, enrolment_id, field, updated_at")
    .in("enrolment_id", allowed.map((c) => c.enrolmentId))
    .like("field", "exercise:%")
    .or(ranges.join(","))
    .limit(200);
  const found = ((rows ?? []) as { id: string; enrolment_id: string; field: string; updated_at: string }[]).filter((r) => r.id !== excludeAnswerId);
  if (found.length === 0) return null;

  const { data: marks } = await supabase.from("review_marks").select("answer_id").in("answer_id", found.map((r) => r.id)).eq("state", "set_aside");
  const setAside = new Set(((marks ?? []) as { answer_id: string }[]).map((m) => m.answer_id));
  const candidates = found
    .filter((r) => !setAside.has(r.id))
    .map((r) => ({ ...r, date: localParts(new Date(r.updated_at), tz).date }))
    .filter((r) => labelFor(r.date, days) !== null);
  if (candidates.length === 0) return null;

  const { data: enrols } = await supabase.from("enrolments").select("id, version_id, tenant_id").in("id", [...new Set(candidates.map((c) => c.enrolment_id))]);
  const enrolOf = new Map(((enrols ?? []) as EnrolRow[]).map((e) => [e.id, e]));

  for (const c of orderCandidates(candidates, `${userId}|${today}`).slice(0, 6)) {
    const enrol = enrolOf.get(c.enrolment_id);
    if (!enrol) continue;
    const question = await fieldLabel(supabase as never, enrol.version_id, c.field);
    if (!question) continue;
    const { data: sealedRow } = await supabase.from("answers").select("sealed").eq("id", c.id).maybeSingle();
    const sealed = (sealedRow as { sealed?: string } | null)?.sealed;
    if (!sealed) continue;
    try {
      const value = await unseal({ userId, tenantId: enrol.tenant_id || MARKETPLACE_TENANT_ID, field: c.field }, sealed);
      const text = reviewText(value);
      if (text) return { answerId: c.id, label: labelFor(c.date, days)!, question, text };
    } catch {
      // an answer that will not open is skipped, never shown
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Words this month
// ---------------------------------------------------------------------------

/** How many answers one page load may open to count. The rest are counted on later loads. */
const COUNT_BATCH = 150;

/**
 * Words the reader wrote in exercises this month. Counts are kept per answer
 * as a number only (answer_word_counts, service role). Returns null when the
 * counting store is unavailable, and the You page then shows nothing.
 */
export async function loadWordsThisMonth(userId: string, now: Date = new Date()): Promise<{ words: number; line: string | null } | null> {
  try {
    const supabase = await createUserClient();
    const admin = createAdminClient();
    const tz = await readerTimeZone(supabase);
    const since = monthStartUtc(now, tz).toISOString();
    const { data: answers } = await supabase.from("answers").select("id, enrolment_id, field, updated_at").like("field", "exercise:%").gte("updated_at", since).limit(3000);
    const list = (answers ?? []) as { id: string; enrolment_id: string; field: string; updated_at: string }[];
    if (list.length === 0) return { words: 0, line: null };

    const { data: counts } = await admin.from("answer_word_counts").select("answer_id, words, counted_for").in("answer_id", list.map((a) => a.id));
    const countOf = new Map(((counts ?? []) as { answer_id: string; words: number; counted_for: string }[]).map((c) => [c.answer_id, c]));
    let total = 0;
    const stale: typeof list = [];
    for (const a of list) {
      const c = countOf.get(a.id);
      if (c && countIsCurrent(c.counted_for, a.updated_at)) total += c.words;
      else stale.push(a);
    }

    const batch = stale.slice(0, COUNT_BATCH);
    if (batch.length > 0) {
      const { data: enrols } = await supabase.from("enrolments").select("id, tenant_id").in("id", [...new Set(batch.map((a) => a.enrolment_id))]);
      const tenantOf = new Map(((enrols ?? []) as { id: string; tenant_id: string }[]).map((e) => [e.id, e.tenant_id]));
      const { data: sealedRows } = await supabase.from("answers").select("id, sealed").in("id", batch.map((a) => a.id));
      const sealedOf = new Map(((sealedRows ?? []) as { id: string; sealed: string }[]).map((r) => [r.id, r.sealed]));
      const writes: { answer_id: string; words: number; counted_for: string }[] = [];
      for (const a of batch) {
        const sealed = sealedOf.get(a.id);
        if (!sealed) continue;
        try {
          const value = await unseal({ userId, tenantId: tenantOf.get(a.enrolment_id) || MARKETPLACE_TENANT_ID, field: a.field }, sealed);
          const words = Math.min(wordsIn(value), 100000);
          total += words;
          writes.push({ answer_id: a.id, words, counted_for: a.updated_at });
        } catch {
          // an answer that will not open adds nothing
        }
      }
      if (writes.length > 0) await admin.from("answer_word_counts").upsert(writes, { onConflict: "answer_id" });
    }
    return { words: total, line: wordsLine(total) };
  } catch {
    return null;
  }
}
