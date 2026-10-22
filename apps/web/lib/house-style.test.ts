import { describe, expect, it } from "vitest";
import { bioIssues, bioReviewFlags, hasStyleErrors, houseStyleIssues, introIssues, lineIssues } from "./house-style";

const GOOD_BIO = "Sam Author writes about small habits and the work of a normal week. Sam lives in Leeds and teaches evening classes.";

describe("house style lint", () => {
  it("accepts a plain third person bio", () => {
    expect(bioIssues(GOOD_BIO)).toEqual([]);
  });

  it("treats blank copy as fine, because the field is optional", () => {
    expect(bioIssues("   ")).toEqual([]);
    expect(introIssues("")).toEqual([]);
  });

  it("refuses dashes, curly quotes and emoji", () => {
    expect(hasStyleErrors(houseStyleIssues("Sam writes — and teaches."))).toBe(true);
    expect(hasStyleErrors(houseStyleIssues("Sam’s book is out."))).toBe(true);
    expect(houseStyleIssues("Sam writes \u{1F600}.").some((i) => i.rule === "emoji")).toBe(true);
  });

  it("refuses first person in a bio but not in an intro", () => {
    const first = "I write about small habits and the work of a normal week, and I teach evening classes.";
    expect(bioIssues(first).some((i) => i.rule === "third_person")).toBe(true);
    expect(introIssues(first).some((i) => i.rule === "third_person")).toBe(false);
  });

  it("holds the length limits", () => {
    expect(bioIssues("Too short.").some((i) => i.rule === "too_short")).toBe(true);
    expect(bioIssues("Sam writes. ".repeat(80)).some((i) => i.rule === "too_long")).toBe(true);
    expect(lineIssues("x".repeat(241)).some((i) => i.rule === "too_long")).toBe(true);
    expect(lineIssues("x".repeat(240)).some((i) => i.rule === "too_long")).toBe(false);
  });

  it("flags claim words but allows a denial", () => {
    expect(introIssues("This Theme will cure your worries.").some((i) => i.rule === "claim")).toBe(true);
    expect(introIssues("These workbooks are not a treatment, and they do not diagnose.").some((i) => i.rule === "claim")).toBe(false);
  });

  it("asks for UK spelling", () => {
    const issues = introIssues("Choose a color and organize the week.");
    expect(issues.filter((i) => i.rule === "spelling")).toHaveLength(2);
  });

  it("warns, without blocking, about machine-sounding words and long sentences", () => {
    const issues = introIssues("We utilise a calm approach.");
    expect(issues.some((i) => i.severity === "warning")).toBe(true);
    expect(hasStyleErrors(issues)).toBe(false);
  });

  it("lists errors before warnings", () => {
    const issues = introIssues("We utilise color — always.");
    const firstWarning = issues.findIndex((i) => i.severity === "warning");
    const lastError = issues.map((i) => i.severity).lastIndexOf("error");
    expect(lastError).toBeLessThan(firstWarning);
  });

  it("turns bio style errors into short review flags beside the claim flags", () => {
    expect(bioReviewFlags(GOOD_BIO, [])).toEqual([]);
    const flags = bioReviewFlags("I write — a lot about my work and many other things in life.", ["guaranteed"]);
    expect(flags).toEqual(expect.arrayContaining(["guaranteed", "Style: dash or curly quote", "Style: first person"]));
    expect(bioReviewFlags("Short.", [])).toEqual(["Style: under 40 characters"]);
    expect(new Set(flags).size).toBe(flags.length);
  });
});
