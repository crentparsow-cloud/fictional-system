import { describe, expect, it } from "vitest";
import {
  claimErrorCode,
  cleanInviteEmail,
  dateInputToIso,
  isoToDateInput,
  orgErrorNotice,
  orgNotice,
  orgPrivacyLine,
  parseCustomerOrgForm,
  parseInvoiceRef,
  parseLicenceForm,
  parseSeats,
  parseTitleIds,
  seatJoinUrl,
  seatLinkCopy,
  slugFor,
  startedText,
  ORG_NOTICES,
  CLAIM_ERRORS,
} from "./org-pilot";

const form = (o: Record<string, string | string[]>) => ({
  get: (k: string) => (Array.isArray(o[k]) ? (o[k] as string[])[0] : o[k]),
  getAll: (k: string) => (Array.isArray(o[k]) ? (o[k] as string[]) : o[k] === undefined ? [] : [o[k]]),
});

const A = "a0240000-0000-0000-0000-0000000000c1";
const B = "a0240000-0000-0000-0000-0000000000c2";

describe("customer organisation form", () => {
  const good = {
    kind: "church",
    display_name: "St Mary's, Leeds",
    legal_name: "PCC of St Mary",
    country: "gb",
    size_band: "50_249",
    sector: "",
    charity_number: "1123456",
    vat_number: "",
    billing_name: "Jo Treasurer",
    billing_email: "Treasurer@StMarys.example",
  };

  it("accepts a church with a charity number and lower-cases the billing address", () => {
    const r = parseCustomerOrgForm(form(good).get);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ kind: "church", country: "GB", slug: "st-mary-s-leeds", charity_number: "1123456", billing_email: "treasurer@stmarys.example", vat_number: null });
  });

  it("refuses kinds that are not customer kinds", () => {
    for (const kind of ["publisher", "akana_house", "individual", "school", ""]) {
      const r = parseCustomerOrgForm(form({ ...good, kind }).get);
      expect(r).toEqual({ ok: false, field: "kind" });
    }
  });

  it("checks the VAT number, the billing email and the country", () => {
    expect(parseCustomerOrgForm(form({ ...good, vat_number: "gb 123 456 789" }).get)).toMatchObject({ ok: true, value: { vat_number: "GB123456789" } });
    expect(parseCustomerOrgForm(form({ ...good, vat_number: "123" }).get)).toEqual({ ok: false, field: "vat_number" });
    expect(parseCustomerOrgForm(form({ ...good, billing_email: "nope" }).get)).toEqual({ ok: false, field: "billing_email" });
    expect(parseCustomerOrgForm(form({ ...good, country: "GBR" }).get)).toEqual({ ok: false, field: "country" });
    expect(parseCustomerOrgForm(form({ ...good, size_band: "huge" }).get)).toEqual({ ok: false, field: "size_band" });
    expect(parseCustomerOrgForm(form({ ...good, display_name: "!!!" }).get)).toEqual({ ok: false, field: "display_name" });
  });

  it("makes slugs the database accepts", () => {
    expect(slugFor("Café & Co.")).toBe("cafe-and-co");
    expect(slugFor("  --  ")).toBe("");
  });
});

describe("licence form", () => {
  const good = { kind: "teams", title_scope: "membership", seats: "20", starts_on: "2026-11-01", ends_on: "2027-11-01", invoice_ref: "INV-0042" };

  it("accepts a membership licence and drops any ticked titles", () => {
    const f = form({ ...good, titles: [A] });
    const r = parseLicenceForm(f.get, f.getAll);
    expect(r).toEqual({
      ok: true,
      value: { kind: "teams", title_scope: "membership", seats: 20, starts_at: "2026-11-01T00:00:00.000Z", ends_at: "2027-11-01T00:00:00.000Z", invoice_ref: "INV-0042", titles: [] },
    });
  });

  it("needs titles for a list licence and removes repeats", () => {
    const none = form({ ...good, title_scope: "list" });
    expect(parseLicenceForm(none.get, none.getAll)).toEqual({ ok: false, field: "titles" });
    const two = form({ ...good, title_scope: "list", titles: [A, B, A] });
    expect(parseLicenceForm(two.get, two.getAll)).toMatchObject({ ok: true, value: { titles: [A, B] } });
    const bad = form({ ...good, title_scope: "list", titles: [A, "not-a-uuid"] });
    expect(parseLicenceForm(bad.get, bad.getAll)).toEqual({ ok: false, field: "titles" });
  });

  it("refuses an end before the start, bad seats and a bad invoice reference", () => {
    const f1 = form({ ...good, ends_on: "2026-10-01" });
    expect(parseLicenceForm(f1.get, f1.getAll)).toEqual({ ok: false, field: "ends_on" });
    const f2 = form({ ...good, seats: "0" });
    expect(parseLicenceForm(f2.get, f2.getAll)).toEqual({ ok: false, field: "seats" });
    const f3 = form({ ...good, invoice_ref: "<script>" });
    expect(parseLicenceForm(f3.get, f3.getAll)).toEqual({ ok: false, field: "invoice_ref" });
    const f4 = form({ ...good, kind: "enterprise" });
    expect(parseLicenceForm(f4.get, f4.getAll)).toEqual({ ok: false, field: "kind" });
  });

  it("parses the small pieces", () => {
    expect(parseSeats("12")).toBe(12);
    expect(parseSeats("10001")).toBeNull();
    expect(parseSeats("1.5")).toBeNull();
    expect(parseInvoiceRef("")).toBeNull();
    expect(parseInvoiceRef("PO 2026/11")).toBe("PO 2026/11");
    expect(parseInvoiceRef("x".repeat(61))).toBe(false);
    expect(dateInputToIso("2026-02-30")).toBeNull();
    expect(isoToDateInput("2026-11-01T00:00:00.000Z")).toBe("2026-11-01");
    expect(parseTitleIds(Array.from({ length: 201 }, (_, i) => `a0240000-0000-0000-0000-${String(i).padStart(12, "0")}`))).toBeNull();
  });
});

describe("invitations", () => {
  it("cleans one address", () => {
    expect(cleanInviteEmail("  Amy@Work.Example ")).toBe("amy@work.example");
    expect(cleanInviteEmail("amy")).toBeNull();
    expect(cleanInviteEmail(undefined)).toBeNull();
  });

  it("builds the join link on the apex path the proxy keeps to the marketplace", () => {
    expect(seatJoinUrl("https://akana.example", "tok")).toBe("https://akana.example/org/join/tok");
  });

  it("has copy for every closed link state, with no em dashes", () => {
    for (const s of ["unknown", "expired", "used", "revoked", "declined", "closed"] as const) {
      const c = seatLinkCopy(s);
      expect(c.title.length).toBeGreaterThan(5);
      expect(`${c.title} ${c.body}`).not.toContain("—");
    }
  });

  it("maps claim errors to fixed codes with words for each", () => {
    for (const code of ["AKO10", "AKO04", "AKO06", "AKO07", "XX000", undefined]) {
      expect(CLAIM_ERRORS[claimErrorCode(code)]).toBeTruthy();
    }
  });
});

describe("counts", () => {
  it("shows only what the database released", () => {
    expect(startedText("exact", 12, 5)).toBe("12");
    expect(startedText("at_least", 10, 5)).toBe("At least 10");
    expect(startedText("fewer_than", null, 5)).toBe("Fewer than 5");
    expect(startedText("hidden", null, 5)).toBe("Not shown while numbers are small");
    // A value that arrives with a suppressed state is never shown.
    expect(startedText("fewer_than", 3, 5)).toBe("Fewer than 5");
    expect(startedText("hidden", 7, 5)).not.toContain("7");
    expect(startedText(undefined, 7, 5)).not.toContain("7");
  });
});

describe("notices and copy", () => {
  it("maps database codes to notices that exist", () => {
    for (const code of ["AKO01", "AKO02", "AKO05", "AKO07", "AKO08", "AKO09", "AKO29", "AKS01", "42501", "P0001", undefined]) {
      expect(ORG_NOTICES[orgErrorNotice(code)]).toBeTruthy();
    }
    expect(orgNotice("released")?.tone).toBe("ok");
    expect(orgNotice("<script>")).toBeNull();
  });

  it("states the privacy line without promising features the pilot lacks", () => {
    const line = orgPrivacyLine("Akana");
    expect(line).toContain("never who wrote what");
    expect(line).not.toMatch(/group leader|finished/);
  });

  it("names no price anywhere", () => {
    const all = JSON.stringify(ORG_NOTICES) + JSON.stringify(CLAIM_ERRORS) + orgPrivacyLine("Akana");
    expect(all).not.toMatch(/£|\bper seat\b|\bGBP\b/);
  });
});
