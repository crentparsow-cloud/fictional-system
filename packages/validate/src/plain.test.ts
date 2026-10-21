import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorkbookV3 } from "@akana/schema";
import { checkPlainStrings, checkPlainWorkbook, plainFindings, summarisePlain, unitTitleFinding } from "./plain";

const rules = (text: string) => plainFindings(text, "t").map((f) => f.rule);

describe("plainFindings", () => {
  it("passes a short plain sentence", () => {
    expect(plainFindings("Your answers stay on this device until you save them.", "t")).toEqual([]);
  });

  it("flags a sentence over 25 words and leaves one of exactly 25 alone", () => {
    const twentyFive = Array.from({ length: 25 }, (_, i) => `w${i}`).join(" ") + ".";
    expect(rules(twentyFive)).toEqual([]);
    expect(rules(twentyFive.replace(".", " more."))).toEqual(["long_sentence"]);
  });

  it("flags negative contractions and not positive ones", () => {
    expect(rules("You can't undo this.")).toEqual(["negative_contraction"]);
    expect(rules("It's saved. We'll send a receipt.")).toEqual([]);
  });

  it("flags the banned list with a plainer word", () => {
    const f = plainFindings("Utilise this page in order to leverage your notes.", "t");
    expect(f.map((x) => x.rule)).toEqual(["banned_word", "banned_word", "banned_word"]);
    expect(f[0]!.message).toBe("'Utilise': use");
  });

  it("flags the AI-tic words and the formal apology", () => {
    expect(rules("Delve into a rich tapestry of ideas.")).toEqual(["banned_word", "banned_word"]);
    expect(rules("We'd like to apologise for the delay.")).toEqual(["banned_word"]);
    expect(rules("We're sorry. The page did not load.")).toEqual([]);
  });

  it("every finding is a warning in the plain category", () => {
    for (const f of plainFindings("Don't utilise this.", "t")) {
      expect(f.severity).toBe("warning");
      expect(f.category).toBe("plain");
    }
  });
});

describe("unitTitleFinding", () => {
  it("flags a label and passes a sentence", () => {
    expect(unitTitleFinding("Budgeting basics", "u")?.rule).toBe("short_unit_title");
    expect(unitTitleFinding("Know what the week really cost you", "u")).toBeUndefined();
  });
});

describe("checkPlainStrings", () => {
  it("walks a flat message file and keeps the keys as paths", () => {
    const f = checkPlainStrings({ "a.b": "You don't need a card.", "a.c": "Fine." }, "en-GB");
    expect(f).toHaveLength(1);
    expect(f[0]!.path).toBe("en-GB.a.b");
  });
});

describe("checkPlainWorkbook", () => {
  const FILE = join(import.meta.dirname, "..", "..", "..", "content", "workbooks", "v3", "focus.json");
  const doc = WorkbookV3.parse(JSON.parse(readFileSync(FILE, "utf8")));

  it("skips house-only keys and applies the unit title rule to units[].focus", () => {
    const base = checkPlainWorkbook(doc);
    expect(base.some((f) => f.path.startsWith("internal"))).toBe(false);
    const copy = structuredClone(doc);
    copy.units[0]!.focus = "Week one";
    const f = checkPlainWorkbook(copy).filter((x) => x.rule === "short_unit_title");
    expect(f.map((x) => x.path)).toContain("units[1].focus");
    const counts = summarisePlain(f);
    expect(counts.short_unit_title).toBe(f.length);
  });
});
