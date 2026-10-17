/**
 * Shaping for /admin/analytics (build list 10.4 and 13.20). Pure, so the
 * page stays thin and the rules can be tested.
 *
 * Counts only. Anything shown per workbook or per cohort goes through
 * suppressed() from lib/admin/funnel.ts, so a number under SUPPRESS_BELOW
 * reads "Fewer than 5". Site-wide totals are exact, as on /admin/funnel.
 */
import { FUNNEL_LABELS, SUPPRESS_BELOW, type FunnelEvent, suppressed } from "@/lib/admin/funnel";

export { SUPPRESS_BELOW, suppressed };

/** One row of public.analytics_funnel. */
export interface FunnelRow {
  event: string;
  workbook_id: string | null;
  workbook_code: string | null;
  unit: number | null;
  n: number;
  uniques: number;
}

/** One row of public.analytics_retention. */
export interface RetentionRow {
  cohort_week: string;
  week_offset: number;
  steps: number;
  cohort_size: number;
}

/** One row of public.analytics_membership. */
export interface MembershipRow {
  metric: string;
  n: number;
}

// ---------------------------------------------------------------------------
// The funnel: workbook page viewed to first unit started to checkout completed
// ---------------------------------------------------------------------------

/** The steps in order. free_week_started is the first opening of unit 1; purchase is a completed checkout. */
export const FUNNEL_STEPS: readonly FunnelEvent[] = ["page_view", "sample_view", "free_week_started", "checkout_started", "purchase"];

export const STEP_LABELS: Record<string, string> = {
  page_view: "Workbook page viewed",
  sample_view: "Sample exercise started",
  free_week_started: "First unit started",
  checkout_started: "Checkout opened",
  purchase: "Checkout completed",
};

export interface FunnelStep {
  event: FunnelEvent;
  label: string;
  n: number;
  uniques: number;
  /** Uniques as a share of the first step's uniques, 0 to 100, or null when the first step is zero. */
  shareOfFirst: number | null;
}

export function funnelSteps(rows: readonly FunnelRow[]): FunnelStep[] {
  const totals = new Map<string, { n: number; uniques: number }>();
  for (const r of rows) {
    const t = totals.get(r.event) ?? { n: 0, uniques: 0 };
    t.n += Number(r.n) || 0;
    t.uniques += Number(r.uniques) || 0;
    totals.set(r.event, t);
  }
  const first = totals.get(FUNNEL_STEPS[0]!)?.uniques ?? 0;
  return FUNNEL_STEPS.map((event) => {
    const t = totals.get(event) ?? { n: 0, uniques: 0 };
    return {
      event,
      label: STEP_LABELS[event] ?? FUNNEL_LABELS[event],
      n: t.n,
      uniques: t.uniques,
      shareOfFirst: first > 0 ? Math.round((t.uniques / first) * 100) : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Drop-off: fields answered against steps finished, per workbook and unit
// ---------------------------------------------------------------------------

export interface UnitDropOff {
  unit: number;
  /** Already suppressed, ready to show. */
  fieldsAnswered: string;
  stepsFinished: string;
}

export interface WorkbookDropOff {
  code: string;
  units: UnitDropOff[];
}

/**
 * Per workbook, per unit: how many fields were answered and how many steps
 * were finished. A unit with many fields answered and few steps finished is
 * where readers stop. Rows without a unit are left out; both numbers are
 * suppressed below SUPPRESS_BELOW.
 */
export function dropOffByUnit(rows: readonly FunnelRow[]): WorkbookDropOff[] {
  const by = new Map<string, Map<number, { fields: number; steps: number }>>();
  for (const r of rows) {
    if (!r.workbook_code || r.unit == null) continue;
    if (r.event !== "field_answered" && r.event !== "step_finished") continue;
    const units = by.get(r.workbook_code) ?? new Map<number, { fields: number; steps: number }>();
    const u = units.get(r.unit) ?? { fields: 0, steps: 0 };
    if (r.event === "field_answered") u.fields += Number(r.n) || 0;
    else u.steps += Number(r.n) || 0;
    units.set(r.unit, u);
    by.set(r.workbook_code, units);
  }
  return [...by.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([code, units]) => ({
      code,
      units: [...units.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([unit, u]) => ({ unit, fieldsAnswered: suppressed(u.fields), stepsFinished: suppressed(u.steps) })),
    }));
}

// ---------------------------------------------------------------------------
// Retention: finished steps per week by cohort of first purchase week
// ---------------------------------------------------------------------------

export const BRACKETS = [
  { key: "w1_4", label: "Weeks 1 to 4", from: 1, to: 4 },
  { key: "w5_8", label: "Weeks 5 to 8", from: 5, to: 8 },
] as const;
export type BracketKey = (typeof BRACKETS)[number]["key"];

export interface CohortRow {
  cohortWeek: string;
  /** True when the cohort has fewer than SUPPRESS_BELOW readers; every number is then withheld. */
  suppressed: boolean;
  size: string;
  /** Steps per week offset 1..weeks, suppressed strings. */
  weeks: string[];
  /** Steps in each bracket, suppressed strings. */
  brackets: Record<BracketKey, string>;
}

/**
 * One row per cohort, newest first, with steps per week for the first
 * `weeks` weeks and the two brackets. A cohort under SUPPRESS_BELOW readers
 * shows nothing but "Fewer than 5" in every cell: a count of steps by two
 * people is a count about two people.
 */
export function cohortTable(rows: readonly RetentionRow[], weeks = 8): CohortRow[] {
  const by = new Map<string, { size: number; steps: Map<number, number> }>();
  for (const r of rows) {
    const c = by.get(r.cohort_week) ?? { size: Number(r.cohort_size) || 0, steps: new Map<number, number>() };
    c.size = Math.max(c.size, Number(r.cohort_size) || 0);
    const w = Number(r.week_offset);
    if (Number.isInteger(w) && w >= 1) c.steps.set(w, (c.steps.get(w) ?? 0) + (Number(r.steps) || 0));
    by.set(r.cohort_week, c);
  }
  const hidden = `Fewer than ${SUPPRESS_BELOW}`;
  return [...by.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([cohortWeek, c]) => {
      const small = c.size < SUPPRESS_BELOW;
      const weekCells: string[] = [];
      for (let w = 1; w <= weeks; w += 1) weekCells.push(small ? hidden : suppressed(c.steps.get(w) ?? 0));
      const brackets = Object.fromEntries(
        BRACKETS.map((b) => {
          let sum = 0;
          for (let w = b.from; w <= b.to; w += 1) sum += c.steps.get(w) ?? 0;
          return [b.key, small ? hidden : suppressed(sum)];
        }),
      ) as Record<BracketKey, string>;
      return { cohortWeek, suppressed: small, size: small ? hidden : c.size.toLocaleString("en-GB"), weeks: weekCells, brackets };
    });
}

// ---------------------------------------------------------------------------
// Membership: day-zero trial cancels and first-month annual cancels
// ---------------------------------------------------------------------------

export const MEMBERSHIP_METRICS = ["trials_started", "day_zero_trial_cancels", "annual_first_month_cancels", "cancels"] as const;
export type MembershipMetric = (typeof MEMBERSHIP_METRICS)[number];

export const MEMBERSHIP_LABELS: Record<MembershipMetric, string> = {
  trials_started: "Trials started",
  day_zero_trial_cancels: "Trials cancelled on day zero",
  annual_first_month_cancels: "Annual memberships cancelled in the first month",
  cancels: "Cancels asked for",
};

export function membershipMetrics(rows: readonly MembershipRow[]): Record<MembershipMetric, number> {
  const out = Object.fromEntries(MEMBERSHIP_METRICS.map((m) => [m, 0])) as Record<MembershipMetric, number>;
  for (const r of rows) {
    if ((MEMBERSHIP_METRICS as readonly string[]).includes(r.metric)) out[r.metric as MembershipMetric] = Number(r.n) || 0;
  }
  return out;
}

/** Weeks of cohorts to ask for, from ?weeks=. 8 to 52, default 26. */
export function parseWeeks(raw: string | string[] | undefined): number {
  const v = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(v)) return 26;
  return Math.min(52, Math.max(8, v));
}
