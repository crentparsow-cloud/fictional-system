import type { Field, WorkbookV3 } from "@akana/schema";
import { START_SCOPE, repeatScope } from "./store";
import { coerceValue, TOOLKIT_OPTIONS_MARKER, type AnswerStore, type FieldValue } from "./types";
import { normaliseNumber, plainText, tableTotals, type TableValue } from "./values";

/**
 * Progress, My plan and milestones (F-017, F-018), worked out from what the
 * app already holds: the reader's own answers and the progress events (ids
 * and timestamps only, F-020). Nothing here is stored, and nothing here
 * counts days in a row, days missed or compares one reader with another.
 * A blank day is simply a day with no check.
 */

/** One progress event as the app reads it back. ref is an id, never an answer. */
export interface ProgressEvent {
  kind: "unit_opened" | "step_done" | "checkin_done" | "daily_check_done" | "toolkit_used" | "finished" | (string & {});
  ref: string | null;
  /** ISO timestamp. */
  at: string;
}

/** Answer scope for a self-check. 0 is the starting self-check, n the one in unit n. */
export const selfcheckScope = (unitNumber: number) => `selfcheck:${unitNumber}`;
/** Answer scope for one day's daily check, by local date (YYYY-MM-DD). */
export const dailyScope = (date: string) => `daily:${date}`;
/** Answer scope for the reader's own edits to My plan. */
export const PLAN_SCOPE = "plan:lines";

/** A gap this long between two events earns the return_after_gap welcome back. */
export const RETURN_GAP_DAYS = 7;
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Answers as plain text, for My plan and the then-and-now card.
// ---------------------------------------------------------------------------

/**
 * A stored answer as one plain line, or "" when there is nothing to show.
 * Lifted from the legacy showVal(), with one change: a checklist shows the
 * options the reader ticked rather than nothing. Ratings and grids are not
 * plan material, so they give "". Numbers, money and tables read as plain
 * figures; a decision matrix gives its highest-scoring option (F-113).
 */
export function answerText(field: Field, stored: FieldValue | undefined, toolkitTitles: readonly string[] = []): string {
  if (stored === undefined || stored === null) return "";
  const v = coerceValue(field, stored);
  switch (field.type) {
    case "short_text":
    case "long_text":
    case "time_of_day":
      return typeof v === "string" ? v.trim() : "";
    case "ranked_list":
      return (v as string[]).map((x) => x.trim()).filter(Boolean).join("; ");
    case "two_column":
      return (v as string[][])
        .map((r) => r.map((x) => x.trim()).filter(Boolean).join(": "))
        .filter(Boolean)
        .join("; ");
    case "checklist": {
      const opts = field.options?.[0] === TOOLKIT_OPTIONS_MARKER ? toolkitTitles : (field.options ?? []);
      return (v as boolean[])
        .map((on, i) => (on ? opts[i] : undefined))
        .filter((x): x is string => typeof x === "string" && x.length > 0)
        .join("; ");
    }
    case "number":
    case "currency":
    case "table":
    case "decision_matrix":
      return plainText(field, v);
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Where things sit in the programme.
// ---------------------------------------------------------------------------

/** The unit an exercise first appears in, or null if no unit lists it. */
export function unitOfExercise(doc: WorkbookV3, exerciseId: string): number | null {
  const units = [...doc.units].sort((a, b) => a.number - b.number);
  return units.find((u) => u.exercise_ids.includes(exerciseId))?.number ?? null;
}

/** The unit an exercise comes back in, or null if it never repeats. */
export function repeatUnitOf(doc: WorkbookV3, exerciseId: string): number | null {
  const units = [...doc.units].sort((a, b) => a.number - b.number);
  return units.find((u) => (u.repeat_ids ?? []).includes(exerciseId))?.number ?? null;
}

/** Exercises in programme order: by the unit that lists them, then their place in it. */
function exercisesInOrder(doc: WorkbookV3): WorkbookV3["exercises"] {
  const byId = new Map(doc.exercises.map((e) => [e.id, e]));
  const out: WorkbookV3["exercises"] = [];
  const seen = new Set<string>();
  for (const u of [...doc.units].sort((a, b) => a.number - b.number)) {
    for (const id of u.exercise_ids) {
      const e = byId.get(id);
      if (e && !seen.has(id)) {
        out.push(e);
        seen.add(id);
      }
    }
  }
  for (const e of doc.exercises) if (!seen.has(e.id)) out.push(e);
  return out;
}

// ---------------------------------------------------------------------------
// prefill_from (F-017)
// ---------------------------------------------------------------------------

/**
 * The starting value for a field that carries prefill_from, or undefined.
 *
 * prefill_from names a field id. Field ids repeat between exercises, so the
 * source is the nearest earlier exercise in programme order that has a
 * field with that id and an answer, its repeat answer first. Only text
 * fields take a prefill, and only while the reader has not answered them:
 * the value then becomes theirs to change.
 *
 * Number and currency fields (F-113) take a figure from an earlier number or
 * currency field, or the total of an earlier computed table's last column.
 */
export function prefillFor(doc: WorkbookV3, exerciseId: string, field: Field, store: AnswerStore, toolkitTitles: readonly string[] = []): FieldValue | undefined {
  if (!field.prefill_from) return undefined;
  if (field.type === "number" || field.type === "currency") return numberPrefill(doc, exerciseId, field, store);
  if (field.type !== "short_text" && field.type !== "long_text") return undefined;
  const order = exercisesInOrder(doc);
  const at = order.findIndex((e) => e.id === exerciseId);
  const earlier = (at < 0 ? order : order.slice(0, at)).reverse();
  for (const e of earlier) {
    const src = e.fields.find((f) => f.id === field.prefill_from);
    if (!src) continue;
    const text = answerText(src, store.get(repeatScope(e.id), src.id), toolkitTitles) || answerText(src, store.get(e.id, src.id), toolkitTitles);
    if (text) return text;
  }
  return undefined;
}

function numberPrefill(doc: WorkbookV3, exerciseId: string, field: Field, store: AnswerStore): number | undefined {
  const order = exercisesInOrder(doc);
  const at = order.findIndex((e) => e.id === exerciseId);
  const earlier = (at < 0 ? order : order.slice(0, at)).reverse();
  for (const e of earlier) {
    const src = e.fields.find((f) => f.id === field.prefill_from);
    if (!src) continue;
    for (const scope of [repeatScope(e.id), e.id]) {
      const stored = store.get(scope, src.id);
      if (stored === undefined) continue;
      let n: number | null = null;
      if (src.type === "number" || src.type === "currency") n = typeof stored === "number" ? stored : null;
      else if (src.type === "table" && src.computed) {
        const totals = tableTotals(src, coerceValue(src, stored) as TableValue);
        n = totals[totals.length - 1] ?? null;
      }
      if (n !== null) return normaliseNumber(field, n) ?? undefined;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// My plan (F-017)
// ---------------------------------------------------------------------------

export interface PlanLine {
  /** Stable key for the line, also the field id its edits are stored under. */
  key: string;
  /** The unit the answer was written in. A repeat is tagged with its repeat unit. */
  unit: number | null;
  /** What the reader sees: their edit if they made one, otherwise their answer. */
  text: string;
  /** The answer the line came from, before any edit. */
  original: string;
  edited: boolean;
  /** The reader took this line out. It stays listed so they can put it back. */
  hidden: boolean;
  /** Where it came from, so the screen can name it. */
  source: { exerciseId: string; title: string; fieldId: string } | { why: true };
}

export interface PlanSectionView {
  id: string;
  title: string;
  lines: PlanLine[];
}

/** Field id for the edit of a plan line. Matches the answers field pattern. */
export const planEditField = (key: string) => key;

/**
 * My plan, built from the reader's answers. Each exercise's feeds_plan says
 * which field goes into which plan section. The repeat answer wins over the
 * first one, as in the legacy planLines(). The why line from Start goes into
 * the first plan section that no exercise feeds, or at the top of the first
 * section when every section is fed.
 *
 * Every line is editable. An edit is stored under PLAN_SCOPE with the line's
 * key; an edit of "" hides the line, so a reader can drop a line they no
 * longer agree with, and null puts their answer back. Lines with no answer
 * yet are left out.
 */
export function planLines(doc: WorkbookV3, store: AnswerStore): PlanSectionView[] {
  const toolkitTitles = doc.toolkit.map((t) => t.title);
  const sections: PlanSectionView[] = doc.plan_sections.map((p) => ({ id: p.id, title: p.title, lines: [] }));
  if (!sections.length) return sections;
  const byId = new Map(sections.map((s) => [s.id, s]));

  const make = (key: string, unit: number | null, original: string, source: PlanLine["source"]): PlanLine | null => {
    const edit = store.get(PLAN_SCOPE, planEditField(key));
    const edited = typeof edit === "string";
    const text = edited ? (edit as string).trim() : original;
    if (!text && !original) return null;
    return { key, unit, text, original, edited, hidden: !text, source };
  };

  // The why line.
  const whyRaw = store.get(START_SCOPE, "why");
  const why = typeof whyRaw === "string" ? whyRaw.trim() : "";
  if (why) {
    const fed = new Set(doc.exercises.flatMap((e) => (e.feeds_plan ?? []).map((fp) => fp.plan_section)));
    const home = sections.find((s) => !fed.has(s.id)) ?? sections[0];
    const line = make("why", null, why, { why: true });
    if (home && line) home.lines.push(line);
  }

  for (const e of exercisesInOrder(doc)) {
    for (const fp of e.feeds_plan ?? []) {
      const section = byId.get(fp.plan_section);
      const field = e.fields.find((f) => f.id === fp.field_id);
      if (!section || !field) continue;
      const repeatText = answerText(field, store.get(repeatScope(e.id), field.id), toolkitTitles);
      const firstText = answerText(field, store.get(e.id, field.id), toolkitTitles);
      const original = repeatText || firstText;
      const unit = repeatText ? repeatUnitOf(doc, e.id) : unitOfExercise(doc, e.id);
      const line = make(`${e.id}.${field.id}`, unit, original, { exerciseId: e.id, title: e.title, fieldId: field.id });
      if (line) section.lines.push(line);
    }
  }
  return sections;
}

export function planLineCount(sections: readonly PlanSectionView[]): number {
  return sections.reduce((n, s) => n + s.lines.filter((l) => !l.hidden).length, 0);
}

// ---------------------------------------------------------------------------
// Progress facts (F-018)
// ---------------------------------------------------------------------------

export interface ProgressFacts {
  /** Answer scopes marked done: exercise ids, and "<id>~r" for repeats. */
  done: Set<string>;
  /** Units whose check-in was saved. */
  checkins: Set<number>;
  /** Units the reader has opened. */
  opened: Set<number>;
  /** Tool id to times used. */
  toolUses: Map<string, number>;
  /** Daily checks saved, in total. Never a run of days. */
  dailyChecks: number;
  finished: boolean;
  /** True when the latest event came after a gap of RETURN_GAP_DAYS or more. A welcome back, never a reproach. */
  returnedAfterGap: boolean;
  /** Self-checks fully answered, by unit number (0 is the starting one). */
  selfchecks: Set<number>;
  planLines: number;
}

export function progressFacts(doc: WorkbookV3, events: readonly ProgressEvent[], store: AnswerStore): ProgressFacts {
  const facts: ProgressFacts = {
    done: new Set(),
    checkins: new Set(),
    opened: new Set(),
    toolUses: new Map(),
    dailyChecks: 0,
    finished: false,
    returnedAfterGap: false,
    selfchecks: new Set(),
    planLines: planLineCount(planLines(doc, store)),
  };
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  for (const e of sorted) {
    if (e.kind === "step_done" && e.ref) facts.done.add(e.ref);
    else if (e.kind === "checkin_done" && e.ref) {
      const n = Number.parseInt(e.ref, 10);
      if (Number.isFinite(n)) facts.checkins.add(n);
    } else if (e.kind === "unit_opened" && e.ref) {
      const n = Number.parseInt(e.ref, 10);
      if (Number.isFinite(n)) facts.opened.add(n);
    } else if (e.kind === "toolkit_used" && e.ref) facts.toolUses.set(e.ref, (facts.toolUses.get(e.ref) ?? 0) + 1);
    else if (e.kind === "daily_check_done") facts.dailyChecks += 1;
    else if (e.kind === "finished") facts.finished = true;
  }
  const last = sorted[sorted.length - 1];
  const before = sorted[sorted.length - 2];
  if (last && before) {
    facts.returnedAfterGap = Date.parse(last.at) - Date.parse(before.at) >= RETURN_GAP_DAYS * DAY_MS;
  }
  if (doc.selfcheck) {
    const items = doc.selfcheck.items;
    const scopes = [0, ...doc.units.filter((u) => u.selfcheck).map((u) => u.number)];
    for (const n of scopes) {
      if (items.length && items.every((i) => typeof store.get(selfcheckScope(n), i.id) === "number")) facts.selfchecks.add(n);
    }
  }
  return facts;
}

/** Exercises done, first runs only. */
export function exercisesDone(facts: ProgressFacts): number {
  return [...facts.done].filter((s) => !s.includes("~")).length;
}

/**
 * A unit is done when every exercise and repeat it lists is marked done, and,
 * when the workbook has a check-in, that unit's check-in is saved. A unit
 * with nothing listed (a locked unit, rebuilt from the outline) is never done.
 */
export function unitComplete(doc: WorkbookV3, unitNumber: number, facts: ProgressFacts): boolean {
  const u = doc.units.find((x) => x.number === unitNumber);
  if (!u || u.exercise_ids.length === 0) return false;
  const all = [...u.exercise_ids, ...(u.repeat_ids ?? []).map(repeatScope)];
  if (!all.every((s) => facts.done.has(s))) return false;
  return !doc.checkin || facts.checkins.has(unitNumber);
}

export function stageComplete(doc: WorkbookV3, stageId: string, facts: ProgressFacts): boolean {
  const stage = doc.structure.stages?.find((s) => s.id === stageId);
  if (!stage || stage.units.length === 0) return false;
  return stage.units.every((n) => unitComplete(doc, n, facts));
}

export function unitsDone(doc: WorkbookV3, facts: ProgressFacts): number[] {
  return doc.units.map((u) => u.number).filter((n) => unitComplete(doc, n, facts));
}

export type CurrentStep =
  | { kind: "exercise"; unit: number; scope: string; exerciseId: string; title: string; repeat: boolean }
  | { kind: "checkin"; unit: number }
  | { kind: "selfcheck"; unit: number }
  | { kind: "locked"; unit: number }
  | { kind: "finish" };

/**
 * The next thing to do: the first unit that is not done, and in it the first
 * exercise, repeat, self-check or check-in still open. Order is the old
 * Today screen's: exercises, repeats, self-check, check-in.
 */
export function currentStep(doc: WorkbookV3, facts: ProgressFacts): CurrentStep {
  const byId = new Map(doc.exercises.map((e) => [e.id, e]));
  for (const u of [...doc.units].sort((a, b) => a.number - b.number)) {
    if (u.exercise_ids.length === 0) return { kind: "locked", unit: u.number };
    for (const id of u.exercise_ids) {
      if (!facts.done.has(id)) return { kind: "exercise", unit: u.number, scope: id, exerciseId: id, title: byId.get(id)?.title ?? "", repeat: false };
    }
    for (const id of u.repeat_ids ?? []) {
      const scope = repeatScope(id);
      if (!facts.done.has(scope)) return { kind: "exercise", unit: u.number, scope, exerciseId: id, title: byId.get(id)?.title ?? "", repeat: true };
    }
    if (u.selfcheck && doc.selfcheck && !facts.selfchecks.has(u.number)) return { kind: "selfcheck", unit: u.number };
    if (doc.checkin && !facts.checkins.has(u.number)) return { kind: "checkin", unit: u.number };
  }
  return { kind: "finish" };
}

// ---------------------------------------------------------------------------
// Milestones (F-018). Only the 13 fixed trigger patterns in the schema.
// ---------------------------------------------------------------------------

export type Milestone = WorkbookV3["milestones"][number];

/**
 * Whether a milestone's trigger is met. Unknown triggers are never met. None
 * of these counts consecutive days: daily_checks:N is checks in total, and
 * return_after_gap is a welcome back after a break.
 */
export function triggerMet(doc: WorkbookV3, trigger: string, facts: ProgressFacts): boolean {
  const [name, arg = ""] = trigger.split(":");
  const n = Number.parseInt(arg, 10);
  const totalTools = [...facts.toolUses.values()].reduce((a, b) => a + b, 0);
  switch (name) {
    case "first_exercise":
      return exercisesDone(facts) >= 1;
    case "first_toolkit_use":
      return totalTools >= 1;
    case "first_repeat":
      return [...facts.done].some((s) => s.includes("~"));
    case "return_after_gap":
      return facts.returnedAfterGap;
    case "program_complete":
    case "finished":
      return facts.finished;
    case "unit_complete":
      return Number.isFinite(n) && unitComplete(doc, n, facts);
    case "stage_complete":
      return arg.length > 0 && stageComplete(doc, arg, facts);
    case "toolkit_uses":
      return Number.isFinite(n) && totalTools >= n;
    case "daily_checks":
      return Number.isFinite(n) && facts.dailyChecks >= n;
    case "selfcheck":
      return Number.isFinite(n) && facts.selfchecks.has(n);
    case "exercises_done":
      return Number.isFinite(n) && exercisesDone(facts) >= n;
    case "plan_lines":
      return Number.isFinite(n) && facts.planLines >= n;
    default:
      return false;
  }
}

export function earnedMilestones(doc: WorkbookV3, facts: ProgressFacts): Milestone[] {
  return doc.milestones.filter((m) => triggerMet(doc, m.trigger, facts));
}

/** The message with its {placeholders} filled. {top_tool} is the most used tool, or a neutral stand-in. */
export function milestoneText(doc: WorkbookV3, m: Milestone, facts: ProgressFacts): string {
  const top = [...facts.toolUses.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const topTitle = doc.toolkit.find((t) => t.id === top)?.title;
  const vars: Record<string, string> = { top_tool: topTitle ?? "your favourite tool" };
  return m.message.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
}

// ---------------------------------------------------------------------------
// Recent daily checks (F-018): a plain list, blank days neutral.
// ---------------------------------------------------------------------------

export interface DailyDay {
  /** Local date, YYYY-MM-DD. */
  date: string;
  checked: boolean;
  /** The reader's own rating that day, when they saved one. Shown back to them only. */
  score?: number | null;
  /** What helped, in the workbook's own words. */
  tags?: string[];
}

export const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * The last `days` days, oldest first, each marked checked or not. There is
 * no run, no count of misses and no comparison. A day with no check is just
 * a day.
 */
export function recentDailyChecks(events: readonly ProgressEvent[], days = 14, now: Date = new Date(), store?: AnswerStore): DailyDay[] {
  const checked = new Set(events.filter((e) => e.kind === "daily_check_done").map((e) => localDay(new Date(e.at))));
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - i));
    const date = localDay(d);
    const day: DailyDay = { date, checked: checked.has(date) };
    if (store) {
      const score = store.get(dailyScope(date), "score");
      const tags = store.get(dailyScope(date), "tags");
      if (typeof score === "number") {
        day.checked = true;
        day.score = score;
      }
      if (Array.isArray(tags)) day.tags = tags.filter((t): t is string => typeof t === "string");
    }
    return day;
  });
}

