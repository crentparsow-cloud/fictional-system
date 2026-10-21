import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkTitleCopy, titleCopyContext, type CatalogueTitle, type TitleCopyContext } from "./title-copy";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const copy = JSON.parse(readFileSync(join(ROOT, "content", "catalog", "title-copy.json"), "utf8")) as { titles: Array<{ code: string; letters: Array<{ from: string }> }> };
const catalogue = JSON.parse(readFileSync(join(ROOT, "docs", "planning", "AK_Demo_Catalogue_v2.json"), "utf8")) as { workbooks: Array<CatalogueTitle & { release: string }> };
const byCode = new Map(catalogue.workbooks.map((w) => [w.code, w]));
const live = catalogue.workbooks.filter((w) => w.is_demo && w.release === "demo_live_after_approval");
const CLASSICS = ["AK-3TQX1", "AK-7SWKN", "AK-B9XEG", "AK-FN9KB", "AK-QCRRE"];

describe("title copy for the live catalogue", () => {
  it("covers all 97 live demo titles and the 5 classics, once each", () => {
    expect(live).toHaveLength(97);
    const codes = copy.titles.map((t) => t.code);
    expect(new Set(codes).size).toBe(102);
    for (const w of live) expect(codes).toContain(w.code);
    for (const c of CLASSICS) expect(codes).toContain(c);
  });

  it("has no errors and no warnings under the claims, style and length rules", () => {
    const findings = copy.titles.flatMap((t) => checkTitleCopy(t, titleCopyContext(byCode.get(t.code)!)));
    expect(findings.map((f) => `${f.severity} ${f.path}: ${f.message}`)).toEqual([]);
  });

  it("writes classics letters as Akana, never as the author, and demo letters as the author marked demo", () => {
    for (const t of copy.titles) {
      const voices = new Set(t.letters.map((l) => l.from));
      expect([...voices]).toEqual([CLASSICS.includes(t.code) ? "akana" : "author"]);
    }
  });
});

describe("checkTitleCopy rules", () => {
  const ctx: TitleCopyContext = { genre: "business", tier: "none", spelling: "en-GB", isDemo: true, units: 6, author: "A. Author" };
  const letter = (id: string, kind: "welcome" | "unit", at?: number) => ({ id, kind, ...(at ? { at_unit: at } : {}), from: "author", demo: true, title: "A note", body: "{first_name}, a short note.", signed: "A. Author" });
  const good = {
    code: "AK-TJWHK",
    card_line: "Keep a cash book you will actually use each day.",
    end_state: Array(65).fill("word").join(" ") + ".",
    who_for: ["Traders", "Shop owners", "Anyone"],
    letters: [letter("welcome", "welcome"), letter("w2", "unit", 2), letter("w4", "unit", 4), letter("w6", "unit", 6)],
  };

  it("passes a well-formed entry", () => {
    expect(checkTitleCopy(good, ctx).filter((f) => f.severity === "error")).toEqual([]);
  });

  it("rejects a short end state, an income promise and a letter past the last unit", () => {
    const msgs = (e: unknown) => checkTitleCopy(e, ctx).filter((f) => f.severity === "error").map((f) => f.message).join("|");
    expect(msgs({ ...good, end_state: "Too short." })).toContain("end state");
    expect(msgs({ ...good, card_line: "Double your income with a cash book." })).toContain("claim");
    expect(msgs({ ...good, letters: [...good.letters.slice(0, 3), letter("w9", "unit", 9)] })).toContain("past the last unit");
  });

  it("rejects an author letter in a classic and a first-person Akana letter", () => {
    const classic = { ...ctx, isDemo: false, author: "Marcus Aurelius" };
    expect(checkTitleCopy(good, classic).some((f) => f.severity === "error" && f.message.includes("Akana"))).toBe(true);
  });
});
