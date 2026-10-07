import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  READER_TERMS_LINKS,
  READER_TERMS_VERSION,
  TERMS_CHANGED_MESSAGE,
  TERMS_REQUIRED_MESSAGE,
  checkoutTermsDecision,
  needsReaderTerms,
  termsHref,
  termsPageContext,
} from "./terms";

const ROOT = path.join(process.cwd(), "..", "..");

describe("reader terms (F-122)", () => {
  it("uses a version the database accepts and that migration 0018 seeds", () => {
    expect(READER_TERMS_VERSION).toMatch(/^[a-z0-9][a-z0-9._-]{0,31}$/);
    const sql = readFileSync(path.join(ROOT, "supabase", "migrations", "0018_terms_acceptance.sql"), "utf8");
    expect(sql).toContain(`'reader_terms', '${READER_TERMS_VERSION}'`);
  });

  it("asks when nothing was accepted or an older version was", () => {
    expect(needsReaderTerms(null)).toBe(true);
    expect(needsReaderTerms(undefined)).toBe(true);
    expect(needsReaderTerms("reader-2000-01")).toBe(true);
    expect(needsReaderTerms(READER_TERMS_VERSION)).toBe(false);
    expect(needsReaderTerms("reader-2026-10", "reader-2026-11")).toBe(true);
  });

  it("records a first acceptance as signup and a later one as reask", () => {
    expect(termsPageContext(null)).toBe("signup");
    expect(termsPageContext("reader-2026-09")).toBe("reask");
  });

  it("builds the terms page link with the next path encoded", () => {
    expect(termsHref("/read/focus?unit=2")).toBe("/terms?next=%2Fread%2Ffocus%3Funit%3D2");
  });

  it("refuses a checkout with no terms version or an old one", () => {
    expect(checkoutTermsDecision(undefined)).toEqual({ ok: false, status: 409, error: TERMS_REQUIRED_MESSAGE, code: "terms_required" });
    expect(checkoutTermsDecision("")).toMatchObject({ ok: false, code: "terms_required" });
    expect(checkoutTermsDecision("reader-1999-01")).toEqual({ ok: false, status: 409, error: TERMS_CHANGED_MESSAGE, code: "terms_changed" });
    expect(checkoutTermsDecision(READER_TERMS_VERSION)).toEqual({ ok: true, version: READER_TERMS_VERSION });
  });

  it("links to the three documents that exist under /legal", () => {
    expect(READER_TERMS_LINKS.map((l) => l.href)).toEqual(["/legal/terms", "/legal/refunds", "/legal/privacy"]);
  });

  it("keeps house style in its messages", () => {
    for (const m of [TERMS_REQUIRED_MESSAGE, TERMS_CHANGED_MESSAGE]) expect(m).not.toMatch(/—/);
  });
});
