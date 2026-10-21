import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WorkbookV3, stripInternal } from "@akana/schema";
import { renderAll } from "../harness";
import { UnitScreen } from "../screens/Unit";
import { MemoryAnswerStore } from "../store";

afterEach(cleanup);

const base = WorkbookV3.parse(stripInternal(JSON.parse(readFileSync(resolve(__dirname, "../../../../content/workbooks/v3/focus.json"), "utf8"))));
const first = base.units[0]!;
const ideas = [
  { heading: "A good life starts as a list of debts", body: "Marcus names those who taught him.", example: "Rusticus taught him to read a letter twice." },
  { heading: "The lessons that last are small and specific", body: "Not be good, but read carefully.", example: "Read the letter twice." },
];

describe("unit screen, schema 3.1 parts", () => {
  it("renders intro, key ideas and takeaway", () => {
    const unit = { ...first, intro: "Book 1 is sixteen paragraphs of thanks.", ideas, takeaway: "Three people are named." };
    const { container } = render(<UnitScreen workbook={base} unit={unit} store={new MemoryAnswerStore()} mode="full" />);
    expect(container.querySelector(".ak-unit-intro")?.textContent).toBe("Book 1 is sixteen paragraphs of thanks.");
    expect(container.querySelectorAll(".ak-idea")).toHaveLength(2);
    expect(container.querySelector(".ak-idea h3")?.textContent).toBe(ideas[0]!.heading);
    expect(container.querySelector(".ak-idea-example")?.textContent).toBe(ideas[0]!.example);
    expect(container.querySelector(".ak-takeaway p")?.textContent).toBe("Three people are named.");
  });

  it("renders the same in paged mode", () => {
    const unit = { ...first, intro: "Why.", ideas, takeaway: "Take this." };
    const { container } = render(<UnitScreen workbook={base} unit={unit} store={new MemoryAnswerStore()} paged />);
    expect(container.querySelectorAll(".ak-idea")).toHaveLength(2);
    expect(container.querySelector(".ak-takeaway")).not.toBeNull();
  });

  it("draws nothing extra for a 3.0 unit", () => {
    const { container } = render(<UnitScreen workbook={base} unit={first} store={new MemoryAnswerStore()} mode="full" />);
    expect(container.querySelector(".ak-unit-reading, .ak-idea, .ak-takeaway")).toBeNull();
  });

  it("passes the harness with the new parts", () => {
    const doc = { ...base, units: base.units.map((u, i) => (i === 0 ? { ...u, intro: "Why.", ideas, takeaway: "Take this." } : u)) };
    const r = renderAll([doc]);
    expect(r.failures).toEqual([]);
  });
});
