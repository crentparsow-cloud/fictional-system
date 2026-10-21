import { formatMinor } from "@/lib/money/format";
import { TALK_TO_US } from "@/lib/org-billing";

/**
 * Organisation plans and prices, Phase B (6.6, 9.1, 9.5, 13.14, 14.37).
 * Pure helpers over the rows of public.org_plan_prices (migration 0060).
 * No price is written in this file: every figure arrives as a row, so a
 * change in the table reaches the Organisations page, the sign-up pages and
 * Stripe Checkout without a release.
 *
 * Wording rules: no "free" where anything is paid, no struck-through price,
 * no countdown. The yearly price and its monthly equivalent are given at the
 * same size. VAT is stated plainly as included or added.
 */

export const SMALL_ORG_PLAN = "small_org_year" as const;
export const CHURCH_BAND_IDS = ["church_band_1", "church_band_2", "church_band_3", "church_band_4"] as const;
export const GROUP_LICENCE_PLAN = "group_licence_six" as const;
export type ChurchBandId = (typeof CHURCH_BAND_IDS)[number];
export type PlanPriceId = typeof SMALL_ORG_PLAN | ChurchBandId | typeof GROUP_LICENCE_PLAN;

export interface PlanPriceRow {
  plan_id: string;
  label: string;
  kind: string;
  currency: string;
  amount_minor: number;
  tax_behavior: string;
  min_seats: number | null;
  max_seats: number | null;
  attendance_min: number | null;
  attendance_max: number | null;
  sort: number;
  active: boolean;
  note: string | null;
}

export interface PlanPrice {
  id: PlanPriceId;
  label: string;
  kind: "seat_year" | "band_year" | "pack_once";
  currency: string;
  amountMinor: number;
  vatIncluded: boolean;
  minSeats: number | null;
  maxSeats: number | null;
  attendanceMin: number | null;
  attendanceMax: number | null;
  sort: number;
}

const KNOWN: readonly string[] = [SMALL_ORG_PLAN, ...CHURCH_BAND_IDS, GROUP_LICENCE_PLAN];

/** Valid, active rows as typed prices, in the table's order. Anything odd is dropped, never guessed. */
export function parsePlanPrices(rows: readonly PlanPriceRow[] | null | undefined): PlanPrice[] {
  const out: PlanPrice[] = [];
  for (const r of rows ?? []) {
    if (!r || !r.active || !KNOWN.includes(r.plan_id)) continue;
    if (r.kind !== "seat_year" && r.kind !== "band_year" && r.kind !== "pack_once") continue;
    if (!Number.isInteger(r.amount_minor) || r.amount_minor <= 0) continue;
    if (!/^[A-Z]{3}$/.test(String(r.currency ?? "").trim())) continue;
    out.push({
      id: r.plan_id as PlanPriceId,
      label: r.label,
      kind: r.kind,
      currency: String(r.currency).trim(),
      amountMinor: r.amount_minor,
      vatIncluded: r.tax_behavior === "inclusive",
      minSeats: r.min_seats,
      maxSeats: r.max_seats,
      attendanceMin: r.attendance_min,
      attendanceMax: r.attendance_max,
      sort: r.sort,
    });
  }
  return out.sort((a, b) => a.sort - b.sort);
}

export function priceOf(prices: readonly PlanPrice[], id: PlanPriceId): PlanPrice | null {
  return prices.find((p) => p.id === id) ?? null;
}

/** Church bands, smallest first. */
export function churchBands(prices: readonly PlanPrice[]): PlanPrice[] {
  return prices.filter((p) => p.kind === "band_year").sort((a, b) => (a.attendanceMin ?? 0) - (b.attendanceMin ?? 0));
}

/** The band a given average Sunday attendance falls in, or null. The organiser still chooses; this only suggests. */
export function bandForAttendance(prices: readonly PlanPrice[], attendance: number): PlanPrice | null {
  if (!Number.isInteger(attendance) || attendance < 0) return null;
  const found = churchBands(prices).filter((b) => attendance >= (b.attendanceMin ?? 0) && (b.attendanceMax === null || attendance <= b.attendanceMax));
  return found.length > 0 ? found[found.length - 1]! : null;
}

/** "Under 50", "50 to 149", "400 or more" from a band's range. */
export function attendanceRangeText(b: Pick<PlanPrice, "attendanceMin" | "attendanceMax">): string {
  const lo = b.attendanceMin ?? 0;
  if (b.attendanceMax === null) return `${lo} or more`;
  if (lo === 0) return `Under ${b.attendanceMax + 1}`;
  return `${lo} to ${b.attendanceMax}`;
}

function vatText(p: Pick<PlanPrice, "vatIncluded">): string {
  return p.vatIncluded ? "VAT included." : "Plus VAT where it applies.";
}

/** The yearly price over twelve, in pounds and pence, for the line beside the yearly figure. */
export function monthlyEquivalent(amountMinor: number, currency: string): string {
  return formatMinor(Math.round(amountMinor / 12), currency);
}

export interface PriceCard {
  id: PlanPriceId;
  heading: string;
  /** The headline figure, always with its period: "£60 a seat a year". */
  primary: string;
  /** The same price another way, at the same size, or null. */
  secondary: string | null;
  lines: string[];
}

/** The small-organisation card. Null when the plan is not on sale. */
export function smallOrgCard(prices: readonly PlanPrice[]): PriceCard | null {
  const p = priceOf(prices, SMALL_ORG_PLAN);
  if (!p || p.minSeats === null || p.maxSeats === null) return null;
  return {
    id: p.id,
    heading: "Small organisation",
    primary: `${formatMinor(p.amountMinor, p.currency)} a seat a year`,
    secondary: `${monthlyEquivalent(p.amountMinor, p.currency)} a seat a month, paid yearly`,
    lines: [
      `${p.minSeats} to ${p.maxSeats} seats, paid once a year.`,
      "Add seats at any time. You pay the part-year price for them straight away.",
      "Take seats away at renewal. You keep the seats you paid for until then.",
      "People join through one sign-up link. No invitations to send.",
      vatText(p),
    ],
  };
}

/** One card for a church band. */
export function churchCard(p: PlanPrice): PriceCard {
  return {
    id: p.id,
    heading: `Church, ${attendanceRangeText(p).toLowerCase()} people on a Sunday`,
    primary: `${formatMinor(p.amountMinor, p.currency)} a year`,
    secondary: `${monthlyEquivalent(p.amountMinor, p.currency)} a month, paid yearly`,
    lines: ["Every member of your church can have a place. The price is for the band, not for each person.", vatText(p)],
  };
}

/** The six-seat group licence card. */
export function groupLicenceCard(prices: readonly PlanPrice[]): PriceCard | null {
  const p = priceOf(prices, GROUP_LICENCE_PLAN);
  if (!p || p.minSeats === null) return null;
  return {
    id: p.id,
    heading: `Group licence, ${p.minSeats} places`,
    primary: `${formatMinor(p.amountMinor, p.currency)} once`,
    secondary: null,
    lines: [`One workbook for ${p.minSeats} people. One payment. It does not renew.`, vatText(p)],
  };
}

/** What the Organisations page needs, or null for "Talk to us" when no price is set. */
export interface OrganisationsPricing {
  small: PriceCard | null;
  churches: PriceCard[];
  group: PriceCard | null;
}

export function organisationsPricing(prices: readonly PlanPrice[]): OrganisationsPricing | null {
  const small = smallOrgCard(prices);
  const churches = churchBands(prices).map(churchCard);
  const group = groupLicenceCard(prices);
  if (!small && churches.length === 0 && !group) return null;
  return { small, churches, group };
}

export const PILOT_AND_REFUND_TEXT = {
  larger: "Buying for more than 50 people? We run a 30-day pilot for you first, then agree an annual invoice.",
  small: "Small teams do not need a pilot. You can cancel within 14 days of starting and get your money back.",
  kit: "Every organisation plan and every group licence includes the group leader kit.",
} as const;

export { TALK_TO_US };

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

const clean = (v: unknown, max = 120) => String(v ?? "").replace(/[\\u0000-\\u001f\\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export interface SmallOrgInput {
  orgKind: "business" | "charity";
  name: string;
  seats: number;
  autoSeat: boolean;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; field: string };

function nameOf(get: (k: string) => unknown): string | null {
  const name = clean(get("name"));
  return name && !/[<>]/.test(name) ? name : null;
}

export function parseSmallOrgForm(get: (k: string) => unknown, price: Pick<PlanPrice, "minSeats" | "maxSeats">): Parsed<SmallOrgInput> {
  const orgKind = String(get("org_kind") ?? "");
  if (orgKind !== "business" && orgKind !== "charity") return { ok: false, field: "org_kind" };
  const name = nameOf(get);
  if (!name) return { ok: false, field: "name" };
  const seats = Number(String(get("seats") ?? "").trim());
  if (!Number.isInteger(seats) || price.minSeats === null || price.maxSeats === null || seats < price.minSeats || seats > price.maxSeats) {
    return { ok: false, field: "seats" };
  }
  if (get("adult") !== "yes") return { ok: false, field: "adult" };
  if (get("renews") !== "yes") return { ok: false, field: "renews" };
  return { ok: true, value: { orgKind, name, seats, autoSeat: get("auto_seat") === "yes" } };
}

export interface ChurchInput {
  band: ChurchBandId;
  name: string;
  autoSeat: boolean;
}

/** The band is the organiser's own choice (self-declared). It must be one on sale. */
export function parseChurchForm(get: (k: string) => unknown, onSale: readonly PlanPrice[]): Parsed<ChurchInput> {
  const band = String(get("band") ?? "");
  if (!(CHURCH_BAND_IDS as readonly string[]).includes(band) || !onSale.some((p) => p.id === band)) return { ok: false, field: "band" };
  const name = nameOf(get);
  if (!name) return { ok: false, field: "name" };
  if (get("adult") !== "yes") return { ok: false, field: "adult" };
  if (get("renews") !== "yes") return { ok: false, field: "renews" };
  if (get("declared") !== "yes") return { ok: false, field: "declared" };
  return { ok: true, value: { band: band as ChurchBandId, name, autoSeat: get("auto_seat") === "yes" } };
}

export interface GroupLicenceInput {
  workbookId: string;
  name: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseGroupLicenceForm(get: (k: string) => unknown, allowed: readonly string[]): Parsed<GroupLicenceInput> {
  const workbookId = String(get("workbook") ?? "");
  if (!UUID.test(workbookId) || !allowed.includes(workbookId)) return { ok: false, field: "workbook" };
  const name = clean(get("name")) || "Study group";
  if (/[<>]/.test(name)) return { ok: false, field: "name" };
  if (get("adult") !== "yes") return { ok: false, field: "adult" };
  return { ok: true, value: { workbookId, name } };
}

// ---------------------------------------------------------------------------
// Stripe
// ---------------------------------------------------------------------------

/**
 * The lookup key of the Stripe price for a plan at its current amount. The
 * amount and VAT treatment are in the key, so a change in the table makes a
 * new Stripe price instead of editing an old one.
 */
export function stripeLookupKey(p: Pick<PlanPrice, "id" | "amountMinor" | "currency" | "vatIncluded">): string {
  return `akana_org_${p.id}_${p.amountMinor}_${p.currency.toLowerCase()}_${p.vatIncluded ? "inc" : "exc"}`;
}

/** The Stripe product name. It never carries a workbook title. */
export function stripeProductName(p: Pick<PlanPrice, "label">): string {
  return `Akana for organisations: ${p.label}`;
}

/** What Checkout shows after a group licence is paid for (the page the buyer lands on). */
export const GROUP_LICENCE_DONE_PATH = "/org/start?done=group";
