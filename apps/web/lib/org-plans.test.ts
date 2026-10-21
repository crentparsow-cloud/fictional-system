import { describe, expect, it } from "vitest";
import {
  attendanceRangeText,
  bandForAttendance,
  churchBands,
  churchCard,
  groupLicenceCard,
  monthlyEquivalent,
  organisationsPricing,
  parseChurchForm,
  parseGroupLicenceForm,
  parsePlanPrices,
  parseSmallOrgForm,
  PILOT_AND_REFUND_TEXT,
  priceOf,
  smallOrgCard,
  stripeLookupKey,
  stripeProductName,
  type PlanPriceRow,
} from "./org-plans";

const row = (o: Partial<PlanPriceRow>): PlanPriceRow => ({
  plan_id: "small_org_year",
  label: "Small organisation",
  kind: "seat_year",
  currency: "GBP",
  amount_minor: 6000,
  tax_behavior: "exclusive",
  min_seats: 5,
  max_seats: 50,
  attendance_min: null,
  attendance_max: null,
  sort: 1,
  active: true,
  note: null,
  ...o,
});

const ROWS: PlanPriceRow[] = [
  row({}),
  row({ plan_id: "church_band_1", kind: "band_year", amount_minor: 12000, min_seats: null, max_seats: null, attendance_min: 0, attendance_max: 49, sort: 2 }),
  row({ plan_id: "church_band_2", kind: "band_year", amount_minor: 24000, min_seats: null, max_seats: null, attendance_min: 50, attendance_max: 149, sort: 3 }),
  row({ plan_id: "church_band_3", kind: "band_year", amount_minor: 48000, min_seats: null, max_seats: null, attendance_min: 150, attendance_max: 399, sort: 4 }),
  row({ plan_id: "church_band_4", kind: "band_year", amount_minor: 90000, min_seats: null, max_seats: null, attendance_min: 400, attendance_max: null, sort: 5 }),
  row({ plan_id: "group_licence_six", kind: "pack_once", amount_minor: 3900, tax_behavior: "inclusive", min_seats: 6, max_seats: 6, sort: 6 }),
];
const prices = parsePlanPrices(ROWS);

describe("parsePlanPrices", () => {
  it("keeps active known rows in order", () => {
    expect(prices.map((p) => p.id)).toEqual(["small_org_year", "church_band_1", "church_band_2", "church_band_3", "church_band_4", "group_licence_six"]);
    expect(priceOf(prices, "group_licence_six")?.vatIncluded).toBe(true);
  });
  it("drops odd rows instead of guessing", () => {
    expect(parsePlanPrices(null)).toEqual([]);
    expect(parsePlanPrices([row({ active: false }), row({ plan_id: "mystery" }), row({ amount_minor: 0 }), row({ currency: "pounds" }), row({ kind: "x" })])).toEqual([]);
  });
});

describe("church bands", () => {
  it("lists four bands, smallest first", () => {
    expect(churchBands(prices).map((b) => b.id)).toEqual(["church_band_1", "church_band_2", "church_band_3", "church_band_4"]);
  });
  it("suggests a band from attendance", () => {
    expect(bandForAttendance(prices, 0)?.id).toBe("church_band_1");
    expect(bandForAttendance(prices, 49)?.id).toBe("church_band_1");
    expect(bandForAttendance(prices, 50)?.id).toBe("church_band_2");
    expect(bandForAttendance(prices, 399)?.id).toBe("church_band_3");
    expect(bandForAttendance(prices, 5000)?.id).toBe("church_band_4");
    expect(bandForAttendance(prices, -1)).toBeNull();
    expect(bandForAttendance(prices, 1.5)).toBeNull();
  });
  it("words the ranges", () => {
    expect(churchBands(prices).map(attendanceRangeText)).toEqual(["Under 50", "50 to 149", "150 to 399", "400 or more"]);
  });
});

describe("cards", () => {
  it("shows the small organisation price with its period and no free claim", () => {
    const c = smallOrgCard(prices)!;
    expect(c.primary).toBe("£60.00 a seat a year");
    expect(c.secondary).toContain("£5.00");
    expect(JSON.stringify(c).toLowerCase()).not.toContain("free");
    expect(c.lines.join(" ")).toContain("5 to 50 seats");
  });
  it("says VAT plainly", () => {
    expect(smallOrgCard(prices)!.lines.join(" ")).toContain("Plus VAT");
    expect(groupLicenceCard(prices)!.lines.join(" ")).toContain("VAT included");
  });
  it("describes the group licence as one payment", () => {
    const g = groupLicenceCard(prices)!;
    expect(g.primary).toBe("£39.00 once");
    expect(g.heading).toContain("6 places");
  });
  it("builds a church card", () => {
    expect(churchCard(churchBands(prices)[0]!).primary).toBe("£120.00 a year");
  });
  it("returns null when nothing is priced", () => {
    expect(organisationsPricing([])).toBeNull();
    expect(smallOrgCard([])).toBeNull();
    expect(organisationsPricing(prices)?.churches).toHaveLength(4);
  });
  it("keeps pilot and refund wording honest", () => {
    expect(PILOT_AND_REFUND_TEXT.larger).toContain("30-day");
    expect(PILOT_AND_REFUND_TEXT.small).toContain("14 days");
  });
  it("rounds the monthly equivalent", () => {
    expect(monthlyEquivalent(12000, "GBP")).toBe("£10.00");
  });
});

const form = (o: Record<string, string>) => (k: string) => o[k];

describe("parseSmallOrgForm", () => {
  const price = { minSeats: 5, maxSeats: 50 };
  const ok = { org_kind: "charity", name: "  Help  Ltd ", seats: "12", adult: "yes", renews: "yes" };
  it("accepts a good form and tidies the name", () => {
    expect(parseSmallOrgForm(form(ok), price)).toEqual({ ok: true, value: { orgKind: "charity", name: "Help Ltd", seats: 12, autoSeat: false } });
  });
  it("enforces seat bounds from the price", () => {
    expect(parseSmallOrgForm(form({ ...ok, seats: "4" }), price)).toEqual({ ok: false, field: "seats" });
    expect(parseSmallOrgForm(form({ ...ok, seats: "51" }), price)).toEqual({ ok: false, field: "seats" });
    expect(parseSmallOrgForm(form({ ...ok, seats: "6.5" }), price)).toEqual({ ok: false, field: "seats" });
  });
  it("needs the adult and renewal ticks and a sane name", () => {
    expect(parseSmallOrgForm(form({ ...ok, adult: "" }), price)).toEqual({ ok: false, field: "adult" });
    expect(parseSmallOrgForm(form({ ...ok, renews: "" }), price)).toEqual({ ok: false, field: "renews" });
    expect(parseSmallOrgForm(form({ ...ok, name: "<b>" }), price)).toEqual({ ok: false, field: "name" });
    expect(parseSmallOrgForm(form({ ...ok, org_kind: "church" }), price)).toEqual({ ok: false, field: "org_kind" });
  });
});

describe("parseChurchForm", () => {
  const ok = { band: "church_band_2", name: "St Mark", adult: "yes", renews: "yes", declared: "yes", auto_seat: "yes" };
  it("takes the band the organiser chose", () => {
    expect(parseChurchForm(form(ok), prices)).toEqual({ ok: true, value: { band: "church_band_2", name: "St Mark", autoSeat: true } });
  });
  it("rejects a band not on sale and a missing declaration", () => {
    expect(parseChurchForm(form({ ...ok, band: "church_band_9" }), prices)).toEqual({ ok: false, field: "band" });
    expect(parseChurchForm(form(ok), prices.filter((p) => p.id !== "church_band_2"))).toEqual({ ok: false, field: "band" });
    expect(parseChurchForm(form({ ...ok, declared: "" }), prices)).toEqual({ ok: false, field: "declared" });
  });
});

describe("parseGroupLicenceForm", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  it("only takes a workbook from the allowed list", () => {
    expect(parseGroupLicenceForm(form({ workbook: id, adult: "yes" }), [id])).toEqual({ ok: true, value: { workbookId: id, name: "Study group" } });
    expect(parseGroupLicenceForm(form({ workbook: id, adult: "yes" }), [])).toEqual({ ok: false, field: "workbook" });
    expect(parseGroupLicenceForm(form({ workbook: "nope", adult: "yes" }), ["nope"])).toEqual({ ok: false, field: "workbook" });
    expect(parseGroupLicenceForm(form({ workbook: id }), [id])).toEqual({ ok: false, field: "adult" });
  });
});

describe("stripe naming", () => {
  it("puts amount and tax treatment in the lookup key", () => {
    const p = priceOf(prices, "small_org_year")!;
    expect(stripeLookupKey(p)).toBe("akana_org_small_org_year_6000_gbp_exc");
    expect(stripeLookupKey({ ...p, amountMinor: 6500 })).not.toBe(stripeLookupKey(p));
  });
  it("never names a workbook", () => {
    expect(stripeProductName({ label: "Group licence" })).toBe("Akana for organisations: Group licence");
  });
});
