import "server-only";
import type { ToolkitCard } from "@akana/engine";
import { unseal } from "@/lib/answers";
import { listLibrary, myEnrolments } from "@/lib/catalogue";
import type { ContinueCard } from "@/lib/catalogue-types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import { MARKETPLACE_TENANT_ID } from "@/lib/tenant";
import { selectTodayCards, isWellbeingReader, type ProgrammeToday, type SavedTool, type TodayCard } from "@/lib/today/cards";
import { gapDue, lastActivityAt, reflectionField } from "@/lib/today/gap";
import { easyStep, resumeHref, stepHref } from "@/lib/today/links";
import { localParts } from "@/lib/today/reminders";
import { fieldLabel, planReview, type ReviewEnrolment } from "@/lib/today/review-plan";
import { effectiveFrequency, isReviewFrequency, reviewText, type ReviewFrequency } from "@/lib/today/review";
import { pickupAllowed } from "@/lib/today/run-reminders";
import { buildSuggestions } from "@/lib/today/suggest";
import { doneExerciseIds, hasFromFieldPaths, nextStep, stepsFromUnitSections, type ProgrammeStep } from "@/lib/today/steps";
import { countedFinishes, rhythmLine, rhythmUnit, thisWeekMarked, type UnitWord } from "@/lib/today/week";

/**
 * Everything the Today page shows, worked out on the server under the
 * reader's own client (row level security decides what is readable). Reader
 * answers stay sealed: the page reads answer field names to check a step is
 * filled, and unseals at most one answer, the review of the day, for its
 * owner.
 */

type UserClient = Awaited<ReturnType<typeof createUserClient>>;

export interface SettingsRow {
  enrolment_id: string;
  reminders_on: boolean;
  reminder_days: number[];
  reminder_time: string;
  timezone: string;
  reminders_stopped_at: string | null;
  review_frequency: string | null;
  pickup_on: boolean | null;
  calendar_token_hash: string | null;
}

export interface TodayView {
  hasProgrammes: boolean;
  wellbeing: boolean;
  cards: TodayCard[];
  /** Href for each card, by index. */
  hrefs: string[];
  rhythm: { line: string; marked: boolean } | null;
  /** The welcome-back variant of the step card, when the reader has been away. */
  welcomeBack: { enrolmentId: string; slug: string; reflectionField: string; gapKey: string; minutes: number; short: boolean } | null;
  review: ReviewView | null;
  /** Programmes with a daily check, for the existing quick tap. */
  continueCards: ContinueCard[];
  timeZone: string;
}

export interface ReviewView {
  answerId: string;
  enrolmentId: string;
  question: string;
  text: string;
  /** The "still true?" answer is saved under this field, in the answer's own enrolment. */
  stillTrueDay: string;
}

const UNIT_WORDS: UnitWord[] = ["week", "day", "module", "chapter", "unit"];
const unitWordOf = (u: string): UnitWord => ((UNIT_WORDS as string[]).includes(u) ? (u as UnitWord) : "unit");

interface EnrolmentRow {
  id: string;
  version_id: string;
  tenant_id: string;
}

export async function loadTodayView(userId: string, now: Date = new Date()): Promise<TodayView> {
  const supabase = await createUserClient();
  const cardsAll = await myEnrolments(userId);
  const wellbeing = cardsAll.some((c) => c.safetyTier !== "none");
  const timeZone = "Europe/London";

  const [library, subRows] = await Promise.all([listLibrary().catch(() => []), loadMembershipStart(supabase)]);

  if (cardsAll.length === 0) {
    const suggestions = buildSuggestions({
      cards: library,
      enrolledWorkbookIds: new Set(),
      enrolledThemeIds: new Set(),
      enrolledGenreIds: new Set(),
      outsideMembership: new Set(),
    });
    const cards = selectTodayCards({ now, programmes: [], savedTools: [], suggestions, membershipStartedAt: subRows });
    return { hasProgrammes: false, wellbeing: false, cards, hrefs: cards.map((c) => (c.kind === "suggestion" ? `/w/${encodeURIComponent(c.suggestion.slug)}` : "/library")), rhythm: null, welcomeBack: null, review: null, continueCards: [], timeZone };
  }

  const ids = cardsAll.map((c) => c.enrolmentId);
  const { data: enrolRows } = await supabase.from("enrolments").select("id, version_id, tenant_id").in("id", ids);
  const enrolOf = new Map(((enrolRows ?? []) as EnrolmentRow[]).map((r) => [r.id, r]));

  const { data: settingsRows } = await supabase
    .from("today_settings")
    .select("enrolment_id, reminders_on, reminder_days, reminder_time, timezone, reminders_stopped_at, review_frequency, pickup_on, calendar_token_hash")
    .in("enrolment_id", ids);
  const settingsOf = new Map(((settingsRows ?? []) as SettingsRow[]).map((r) => [r.enrolment_id, r]));
  const tz = settingsOf.get(cardsAll[0]!.enrolmentId)?.timezone ?? timeZone;

  // Steps, events and answer paths for the three programmes opened most recently.
  const top = cardsAll.slice(0, 3);
  const topVersions = [...new Set(top.map((c) => enrolOf.get(c.enrolmentId)?.version_id).filter((v): v is string => !!v))];
  const { data: unitRows } = topVersions.length
    ? await supabase.from("workbook_sections").select("version_id, unit_number, body").eq("kind", "unit").in("version_id", topVersions)
    : { data: [] };
  const unitsOf = new Map<string, { unit_number: number | null; body: unknown }[]>();
  for (const r of (unitRows ?? []) as { version_id: string; unit_number: number | null; body: unknown }[]) {
    const list = unitsOf.get(r.version_id) ?? [];
    list.push(r);
    unitsOf.set(r.version_id, list);
  }
  const topIds = top.map((c) => c.enrolmentId);
  const { data: eventRows } = await supabase.from("progress_events").select("enrolment_id, kind, ref, at").in("enrolment_id", topIds).order("at", { ascending: false }).limit(3000);
  const eventsOf = new Map<string, { kind: string; ref: string | null; at: string }[]>();
  for (const e of (eventRows ?? []) as { enrolment_id: string; kind: string; ref: string | null; at: string }[]) {
    const list = eventsOf.get(e.enrolment_id) ?? [];
    list.push(e);
    eventsOf.set(e.enrolment_id, list);
  }
  const { data: answerRows } = await supabase.from("answers").select("enrolment_id, field").in("enrolment_id", topIds).limit(5000);
  const pathsOf = new Map<string, Set<string>>();
  for (const a of (answerRows ?? []) as { enrolment_id: string; field: string }[]) {
    const set = pathsOf.get(a.enrolment_id) ?? new Set<string>();
    set.add(a.field);
    pathsOf.set(a.enrolment_id, set);
  }
  const { data: placeRows } = await supabase.from("reading_places").select("enrolment_id, paused").in("enrolment_id", topIds).eq("paused", true);
  const pausedSet = new Set(((placeRows ?? []) as { enrolment_id: string }[]).map((p) => p.enrolment_id));

  const stepsOf = new Map<string, ProgrammeStep[]>();
  const programmes: ProgrammeToday[] = cardsAll.map((c) => {
    const isTop = topIds.includes(c.enrolmentId);
    const steps = isTop ? stepsFromUnitSections(unitsOf.get(enrolOf.get(c.enrolmentId)?.version_id ?? "") ?? []) : [];
    stepsOf.set(c.enrolmentId, steps);
    const done = doneExerciseIds(eventsOf.get(c.enrolmentId) ?? []);
    return {
      enrolmentId: c.enrolmentId,
      slug: c.slug,
      title: c.shortTitle ?? c.title,
      safetyTier: c.safetyTier,
      lastOpenedAt: c.lastOpenedAt,
      unitWord: unitWordOf(c.unitLabel),
      unitCount: c.unitCount,
      next: nextStep(steps, done),
    };
  });

  // Saved toolkit cards.
  const { data: saveRows } = await supabase.from("toolkit_saves").select("enrolment_id, tool_id").in("enrolment_id", ids);
  const savedTools = await loadSavedTools(supabase, (saveRows ?? []) as { enrolment_id: string; tool_id: string }[], enrolOf);

  const enrolledIds = new Set(cardsAll.map((c) => c.workbookId));
  const enrolledCards = library.filter((l) => enrolledIds.has(l.id));
  const outside = new Set<string>();
  if (library.length) {
    const { data: out } = await supabase.from("workbooks").select("id").eq("in_membership", false).in("id", library.map((l) => l.id));
    for (const r of (out ?? []) as { id: string }[]) outside.add(r.id);
  }
  const suggestions = buildSuggestions({
    cards: library,
    enrolledWorkbookIds: enrolledIds,
    enrolledThemeIds: new Set(enrolledCards.map((c) => c.themeId).filter((t): t is string => !!t)),
    enrolledGenreIds: new Set(enrolledCards.map((c) => c.genreId)),
    outsideMembership: outside,
  });

  const cards = selectTodayCards({ now, programmes, savedTools, suggestions, membershipStartedAt: subRows });
  const stepCard = cards.find((c) => c.kind === "step");

  // The weekly rhythm and the pick-up, for the programme leading Today.
  let rhythm: TodayView["rhythm"] = null;
  let welcomeBack: TodayView["welcomeBack"] = null;
  if (stepCard?.kind === "step") {
    const p = stepCard.programme;
    const steps = stepsOf.get(p.enrolmentId) ?? [];
    const events = eventsOf.get(p.enrolmentId) ?? [];
    const has = hasFromFieldPaths(pathsOf.get(p.enrolmentId) ?? new Set());
    const finishes = countedFinishes(steps, events, has);
    const at = rhythmUnit(steps, p.next);
    if (at) {
      rhythm = {
        line: rhythmLine({ unitWord: p.unitWord, unit: at.unit, unitCount: p.unitCount, stepsInUnit: at.stepsInUnit }),
        marked: thisWeekMarked(finishes, now, settingsOf.get(p.enrolmentId)?.timezone ?? tz),
      };
    }
    const row = settingsOf.get(p.enrolmentId);
    const last = lastActivityAt(cardsAll.find((c) => c.enrolmentId === p.enrolmentId)?.lastOpenedAt, events);
    if (last && gapDue(last, now) && pickupAllowed(row?.pickup_on ?? null, p.safetyTier)) {
      const easy = easyStep(stepCard.step);
      welcomeBack = {
        enrolmentId: p.enrolmentId,
        slug: p.slug,
        reflectionField: reflectionField(last),
        gapKey: `akana.pickup.${p.enrolmentId}.${last.toISOString().slice(0, 10)}`,
        minutes: easy.minutes,
        short: easy.short,
      };
    }
  }

  const hrefs = cards.map((c) => {
    if (c.kind === "step") {
      if (pausedSet.has(c.programme.enrolmentId)) return resumeHref(c.programme.slug);
      return stepHref(c.programme.slug, c.step, { short: welcomeBack?.short === true });
    }
    if (c.kind === "tool") {
      const slug = cardsAll.find((x) => x.enrolmentId === c.tool.enrolmentId)?.slug;
      return slug ? `/toolkit` : "/toolkit";
    }
    return `/w/${encodeURIComponent(c.suggestion.slug)}`;
  });

  const review = await loadReview(supabase, userId, cardsAll, enrolOf, settingsOf, now).catch(() => null);

  return {
    hasProgrammes: true,
    wellbeing: wellbeing || isWellbeingReader(programmes),
    cards,
    hrefs,
    rhythm,
    welcomeBack,
    review,
    continueCards: cardsAll,
    timeZone: tz,
  };
}

async function loadMembershipStart(supabase: UserClient): Promise<Date | null> {
  try {
    const { data } = await supabase.from("subscriptions").select("status, created_at").in("status", ["active", "trialing"]).order("created_at", { ascending: true }).limit(1);
    const first = (data as { created_at: string }[] | null)?.[0];
    return first ? new Date(first.created_at) : null;
  } catch {
    return null;
  }
}

async function loadSavedTools(supabase: UserClient, saves: { enrolment_id: string; tool_id: string }[], enrolOf: Map<string, EnrolmentRow>): Promise<SavedTool[]> {
  if (!saves.length) return [];
  const versions = [...new Set(saves.map((s) => enrolOf.get(s.enrolment_id)?.version_id).filter((v): v is string => !!v))];
  const { data } = await supabase.from("workbook_sections").select("version_id, body").eq("kind", "toolkit").in("version_id", versions);
  const cardsOf = new Map<string, ToolkitCard[]>();
  for (const s of (data ?? []) as { version_id: string; body: { cards?: unknown } }[]) cardsOf.set(s.version_id, Array.isArray(s.body?.cards) ? (s.body.cards as ToolkitCard[]) : []);
  const out: SavedTool[] = [];
  for (const s of saves) {
    const card = (cardsOf.get(enrolOf.get(s.enrolment_id)?.version_id ?? "") ?? []).find((c) => c.id === s.tool_id);
    if (card) out.push({ enrolmentId: s.enrolment_id, toolId: s.tool_id, title: card.title, minutes: typeof card.minutes === "number" ? card.minutes : null });
  }
  return out.sort((a, b) => (a.toolId < b.toolId ? -1 : 1));
}

/**
 * The review of the day. A queue row made by the daily job is used if there
 * is one; otherwise the same plan is made now and kept. Only the chosen
 * answer is unsealed, with the enrolment's own tenant, for its owner.
 */
async function loadReview(
  supabase: UserClient,
  userId: string,
  cards: readonly ContinueCard[],
  enrolOf: Map<string, EnrolmentRow>,
  settingsOf: Map<string, SettingsRow>,
  now: Date,
): Promise<ReviewView | null> {
  const targets: ReviewEnrolment[] = cards.flatMap((c) => {
    const e = enrolOf.get(c.enrolmentId);
    if (!e) return [];
    const s = settingsOf.get(c.enrolmentId);
    return [{ enrolmentId: c.enrolmentId, userId, versionId: e.version_id, safetyTier: c.safetyTier, reviewFrequency: s?.review_frequency ?? null, timezone: s?.timezone ?? "Europe/London" }];
  });
  if (!targets.some((t) => effectiveFrequency(isReviewFrequency(t.reviewFrequency) ? (t.reviewFrequency as ReviewFrequency) : null, t.safetyTier) !== "off")) return null;
  const day = localParts(now, targets[0]?.timezone ?? "Europe/London").date;

  const { data: queued } = await supabase.from("review_queue").select("enrolment_id, answer_id").eq("for_day", day).limit(1);
  let answerId = (queued as { answer_id: string }[] | null)?.[0]?.answer_id ?? null;
  let labels: Map<string, { label: string; unit: number }> | null = null;
  let fallbacks: string[] = [];

  if (!answerId) {
    const plan = await planReview(supabase as never, userId, targets, now);
    if (!plan?.pick) return null;
    answerId = plan.pick.id;
    labels = plan.labels;
    fallbacks = plan.fallbacks.map((f) => f.id);
    try {
      await createAdminClient().from("review_queue").upsert({ enrolment_id: plan.pick.enrolmentId, for_day: day, answer_id: plan.pick.id }, { onConflict: "enrolment_id,for_day", ignoreDuplicates: true });
    } catch {
      // the queue is a cache: Today works without it
    }
  }

  for (const id of [answerId, ...fallbacks]) {
    const view = await openReview(supabase, id, enrolOf, labels, userId);
    if (view) return { ...view, stillTrueDay: day };
  }
  return null;
}

async function openReview(
  supabase: UserClient,
  answerId: string,
  enrolOf: Map<string, EnrolmentRow>,
  labels: Map<string, { label: string; unit: number }> | null,
  userId: string,
): Promise<Omit<ReviewView, "stillTrueDay"> | null> {
  const { data } = await supabase.from("answers").select("id, enrolment_id, field, sealed").eq("id", answerId).maybeSingle();
  const row = data as { id: string; enrolment_id: string; field: string; sealed: string } | null;
  const enrol = row ? enrolOf.get(row.enrolment_id) : undefined;
  if (!row || !enrol) return null;

  let label = labels?.get(`${row.enrolment_id}|${row.field}`)?.label;
  if (!label) label = (await fieldLabel(supabase as never, enrol.version_id, row.field)) ?? undefined;
  if (!label) return null;

  try {
    const value = await unseal({ userId, tenantId: enrol.tenant_id || MARKETPLACE_TENANT_ID, field: row.field }, row.sealed);
    const text = reviewText(value);
    return text ? { answerId: row.id, enrolmentId: row.enrolment_id, question: label, text } : null;
  } catch {
    return null;
  }
}

/**
 * Where /today/go sends the reader (12.10): a paused place if there is one,
 * otherwise the next step they have not finished, in the programme they
 * opened last (or the one the link names). Null when there is nothing to
 * open, and the caller falls back to Today.
 */
export async function resolveNextStep(userId: string, preferred: string | null): Promise<string | null> {
  const supabase = await createUserClient();
  const cards = await myEnrolments(userId);
  const order = preferred ? [...cards.filter((c) => c.enrolmentId === preferred), ...cards.filter((c) => c.enrolmentId !== preferred)] : cards;
  for (const card of order.slice(0, 3)) {
    const { data: enrol } = await supabase.from("enrolments").select("version_id").eq("id", card.enrolmentId).maybeSingle();
    const versionId = (enrol as { version_id?: string } | null)?.version_id;
    if (!versionId) continue;

    const { data: place } = await supabase.from("reading_places").select("paused").eq("enrolment_id", card.enrolmentId).maybeSingle();
    if ((place as { paused?: boolean } | null)?.paused) return resumeHref(card.slug);

    const [{ data: units }, { data: events }] = await Promise.all([
      supabase.from("workbook_sections").select("unit_number, body").eq("version_id", versionId).eq("kind", "unit"),
      supabase.from("progress_events").select("kind, ref").eq("enrolment_id", card.enrolmentId).eq("kind", "step_done").limit(3000),
    ]);
    const step = nextStep(stepsFromUnitSections((units ?? []) as { unit_number: number | null; body: unknown }[]), doneExerciseIds((events ?? []) as { kind: string; ref: string | null }[]));
    if (step) return stepHref(card.slug, step);
  }
  return null;
}
