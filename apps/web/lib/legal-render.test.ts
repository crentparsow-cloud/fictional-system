import path from "node:path";
import { describe, expect, it } from "vitest";
import { LEGAL_SLUGS } from "./legal-docs";
import { fillLegalText, legalValues, readLegalDoc, renderLegalDoc, type LegalValues } from "./legal-render";
import { markdownToHtml } from "./markdown";

// Vitest runs from apps/web or from the repo root; resolve from this file.
const DIR = path.join(__dirname, "..", "..", "..", "docs", "legal");

/** A square bracket followed by a word: "[support email]", "[company number]", "[TBC]". */
const PLACEHOLDER = /\[\s*[A-Za-z][^\]<>]*\]?/;

const BLANK: LegalValues = { supportEmail: null, companyNumber: null };
const SET: LegalValues = { supportEmail: "help@akana.example", companyNumber: "01234567" };

describe("legal pages never show a placeholder (M12)", () => {
  for (const slug of LEGAL_SLUGS) {
    it(`${slug}: no square-bracket placeholder while the settings are blank`, () => {
      const { html, banner } = renderLegalDoc(slug, BLANK, DIR);
      expect(html).not.toMatch(PLACEHOLDER);
      expect(banner).not.toMatch(PLACEHOLDER);
    });

    it(`${slug}: no square-bracket placeholder once the settings are filled`, () => {
      const { html } = renderLegalDoc(slug, SET, DIR);
      expect(html).not.toMatch(PLACEHOLDER);
    });

    it(`${slug}: still carries the draft banner`, () => {
      expect(renderLegalDoc(slug, BLANK, DIR).banner).toMatch(/^DRAFT/);
    });
  }

  it("the drafts do hold a token, so these checks fail if the fill is removed", () => {
    const raw = LEGAL_SLUGS.map((slug) => markdownToHtml(readLegalDoc(slug, DIR).body));
    expect(raw.filter((html) => PLACEHOLDER.test(html)).length).toBeGreaterThan(0);
  });

  it("the check itself catches a token that is not filled", () => {
    expect("<p>Email [support email].</p>").toMatch(PLACEHOLDER);
    expect("<p>Number [company number].</p>").toMatch(PLACEHOLDER);
    expect('<p>Write to <a href="/contact">our contact page</a>.</p>').not.toMatch(PLACEHOLDER);
  });

  it("points to the contact page while there is no support address", () => {
    const { html } = renderLegalDoc("refunds", BLANK, DIR);
    expect(html).toContain('write to us through <a href="/contact">our contact page</a>');
    expect(renderLegalDoc("terms", BLANK, DIR).html).toContain('Tell us straight away through <a href="/contact">our contact page</a>');
    expect(renderLegalDoc("privacy", BLANK, DIR).html).toContain('Contact for anything about your data: <a href="/contact">our contact page</a>.');
  });

  it("links the support address once it is set", () => {
    const { html } = renderLegalDoc("refunds", SET, DIR);
    expect(html).toContain('email <a href="mailto:help@akana.example">help@akana.example</a>');
  });

  it("leaves out the company number sentence while the number is blank, and prints it once set", () => {
    const line = "Akana Holdings, 128 City Road. Company number [company number]. Email [support email].";
    expect(fillLegalText(line, BLANK)).toBe("Akana Holdings, 128 City Road. Write to us through [our contact page](/contact).");
    expect(fillLegalText(line, SET)).toBe("Akana Holdings, 128 City Road. Company number 01234567. Email [help@akana.example](mailto:help@akana.example).");
  });

  it("leaves no stray space when the company number sentence opens a line", () => {
    expect(fillLegalText("Intro.\nCompany number [company number]. Next sentence.", BLANK)).toBe("Intro.\nNext sentence.");
  });

  it("reads both values from settings, and treats blank or malformed ones as missing", () => {
    expect(legalValues({})).toEqual(BLANK);
    expect(legalValues({ EMAIL_REPLY_TO: "not-an-address", NEXT_PUBLIC_COMPANY_NUMBER: "  " })).toEqual(BLANK);
    expect(legalValues({ EMAIL_REPLY_TO: "Akana <help@akana.example>", NEXT_PUBLIC_COMPANY_NUMBER: " 01234567 " })).toEqual(SET);
  });
});
