import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WorkbookV3, stripInternal } from "@akana/schema";
import { fillLetter, lettersAt } from "../screens/Letter";
import { StartScreen } from "../screens/Start";
import { UnitScreen } from "../screens/Unit";
import { MemoryAnswerStore } from "../store";

afterEach(cleanup);

const base = WorkbookV3.parse(stripInternal(JSON.parse(readFileSync(resolve(__dirname, "../../../../content/workbooks/v3/focus.json"), "utf8"))));
const letters = [
  { id: "welcome", kind: "welcome" as const, from: "author" as const, demo: true, title: "A welcome from the author", body: "{first_name}, welcome to the workbook.", signed: "The author" },
  { id: "week_two", kind: "unit" as const, at_unit: 1, from: "author" as const, title: "Before week one", body: "{first_name}, one small step is enough.", signed: "The author" },
];
const doc = { ...base, letters };

describe("author letters (12.1)", () => {
  it("fills the first name, and drops the placeholder cleanly without one", () => {
    expect(fillLetter("{first_name}, welcome.", "Ada")).toBe("Ada, welcome.");
    expect(fillLetter("{first_name}, welcome.")).toBe("Welcome.");
    expect(fillLetter("Hello {first_name}.", "  ")).not.toContain("{");
  });

  it("finds the welcome letter and the letters before a unit", () => {
    expect(lettersAt(doc).map((l) => l.id)).toEqual(["welcome"]);
    expect(lettersAt(doc, 1).map((l) => l.id)).toEqual(["week_two"]);
    expect(lettersAt(doc, 2)).toEqual([]);
  });

  it("shows the welcome letter on Start, marked as a demo letter", () => {
    const { container } = render(<StartScreen workbook={doc} why="" firstName="Ada" />);
    expect(container.querySelector(".ak-letter")?.textContent).toContain("Ada, welcome to the workbook.");
    expect(container.querySelector(".ak-letter .ak-eyebrow")?.textContent).toContain("demo letter");
  });

  it("shows a unit letter before its unit and nothing when a workbook has no letters", () => {
    const withLetters = render(<UnitScreen workbook={doc} unit={doc.units[0]!} store={new MemoryAnswerStore()} mode="full" firstName="Ada" />);
    expect(withLetters.container.querySelector(".ak-letter")?.textContent).toContain("Ada, one small step is enough.");
    cleanup();
    const without = render(<UnitScreen workbook={base} unit={base.units[0]!} store={new MemoryAnswerStore()} mode="full" />);
    expect(without.container.querySelector(".ak-letter")).toBeNull();
  });
});
