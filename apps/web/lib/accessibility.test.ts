import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ACCESSIBILITY } from "@/lib/accessibility";

const ROOT = path.join(process.cwd(), "..", "..");
const text = JSON.stringify(ACCESSIBILITY);

describe("accessibility statement (11.5)", () => {
  it("names WCAG 2.2 level AA as the aim and gives a contact route", () => {
    expect(ACCESSIBILITY.standard).toBe("WCAG 2.2 level AA");
    expect(ACCESSIBILITY.aim).toMatch(/aim/);
    expect(ACCESSIBILITY.contact.route).toBe("/contact");
    expect(ACCESSIBILITY.contact.howTo).toMatch(/Accessibility/);
  });

  it("claims no conformance the manual pass has not shown", () => {
    expect(text).not.toMatch(/fully (conform|compl)|is compliant|are compliant|meets? (all|every)|100%|certified|accessible to everyone/i);
    expect(ACCESSIBILITY.aim).toMatch(/do not yet claim/);
    expect(ACCESSIBILITY.notYetTested.some((n) => /manual pass/i.test(n.title))).toBe(true);
  });

  it("promises a conformance report for organisation buyers", () => {
    expect(ACCESSIBILITY.conformance).toMatch(/conformance report/);
    expect(ACCESSIBILITY.conformance).toMatch(/organisations/);
  });

  it("uses house style: no em dashes, no exclamation marks, no emojis", () => {
    expect(text).not.toMatch(/—|–/);
    expect(text).not.toMatch(/!/);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("agrees with docs/ACCESSIBILITY.md on the sweep date and the findings", () => {
    const file = path.join(ROOT, "docs", "ACCESSIBILITY.md");
    expect(existsSync(file)).toBe(true);
    const doc = readFileSync(file, "utf8");
    expect(doc).toContain("8 October 2026");
    expect(ACCESSIBILITY.sweepRun).toBe("8 October 2026");
    expect(doc).toContain("scrollable-region-focusable");
    expect(doc).toContain("landmark-one-main");
  });
});
