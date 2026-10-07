import { describe, expect, it } from "vitest";
import type { WorkbookV3Input } from "@akana/schema";
import { validateWorkbook } from "./index";

function financeWorkbook(over: Partial<WorkbookV3Input> = {}): WorkbookV3Input {
  return {
    schema_version: "3.0",
    code: "AK-TJWHK",
    slug: "the-open-air-ledger-tjwhk",
    title: "The Open-Air Ledger",
    card_line: "Keep a daily cash book, price with margin and know your real takings.",
    book: { book_id: "the-open-air-ledger", title: "The Open-Air Ledger" },
    author: { author_id: "AU-9ZG4W", display_name: "Chidinma Obiora-Lane" },
    genre: "business",
    language: "en",
    spelling: "en-GB",
    is_demo: true,
    depth: "first_unit",
    badge: "demo",
    safety_tier: "none",
    advice_guardrail: "not_legal_or_tax_advice",
    structure: { unit: "week", count: 2, free_units: 1 },
    start: {
      welcome: "This workbook walks beside your stall for two weeks. Each day takes a few minutes.",
      how_it_works: ["Open the week.", "Do the exercise.", "Write one line in your cash book."],
      why_prompt: "What would knowing your real takings change for you?",
    },
    units: [
      { number: 1, focus: "A one-page daily cash book.", exercise_ids: ["cash_book"] },
      { number: 2, focus: "A weekly count.", exercise_ids: ["weekly_count"] },
    ],
    exercises: [
      {
        id: "cash_book",
        title: "Start your cash book",
        purpose: "Set up one page that holds every day's money in and money out.",
        why: "A trader who writes down takings every evening knows the week before it ends.",
        source: { chapter: "1" },
        minutes: 10,
        steps: [{ text: "Draw four columns: date, in, out, left." }, { text: "Fill in today from memory." }],
        fields: [
          { id: "takings", type: "currency", label: "Money in today", unit: "NGN", min: 0 },
          { id: "note", type: "short_text", label: "One thing you noticed" },
        ],
        done_when: "Today has a line in the book.",
      },
      {
        id: "weekly_count",
        title: "Count the week",
        purpose: "Add up seven days and see the real figure.",
        why: "A week is long enough to show a pattern and short enough to act on.",
        source: { chapter: "2" },
        minutes: 15,
        steps: [{ text: "Copy each day's left column." }, { text: "Add them up." }, { text: "Write the total at the foot of the page." }],
        fields: [{ id: "total", type: "number", label: "Week total", prefill_from: "takings" }],
        done_when: "The week has a total.",
      },
    ],
    finish: { summary: "Two weeks of lines in a book you own.", book_bridge: "The book goes on from here to pricing with margin." },
    ...over,
  };
}

describe("validateWorkbook", () => {
  it("passes a small business workbook", () => {
    const r = validateWorkbook(financeWorkbook());
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("rejects a schema error", () => {
    const r = validateWorkbook({ ...financeWorkbook(), code: "AK-TJWHI" });
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.category).toBe("schema");
  });

  it("requires the advice guardrail on finance and business titles", () => {
    const r = validateWorkbook(financeWorkbook({ advice_guardrail: undefined }));
    expect(r.errors.some((e) => e.category === "safety" && e.path === "advice_guardrail")).toBe(true);
  });

  it("applies the reduced claims list outside wellbeing and the full list inside it", () => {
    const copy = "This helps you see the week.";
    const business = validateWorkbook(financeWorkbook({ card_line: copy }));
    expect(business.errors.filter((e) => e.category === "claims")).toEqual([]);

    const wb = validateWorkbook(financeWorkbook({ genre: "wellbeing", safety_tier: "standard", advice_guardrail: undefined, card_line: copy }), { lenient: true });
    expect(wb.errors.some((e) => e.category === "claims")).toBe(true);
  });

  it("blocks income promises in finance copy", () => {
    const r = validateWorkbook(financeWorkbook({ card_line: "Double your income in a month." }));
    expect(r.errors.some((e) => e.category === "claims")).toBe(true);
  });

  it("checks spelling in the direction the workbook asks for", () => {
    const gb = validateWorkbook(financeWorkbook({ card_line: "Organize your color-coded book." }));
    expect(gb.errors.filter((e) => e.message.includes("spelling")).length).toBe(2);
    const us = validateWorkbook(financeWorkbook({ spelling: "en-US", card_line: "Organize your color-coded book." }));
    expect(us.errors.filter((e) => e.message.includes("spelling"))).toEqual([]);
  });

  it("flags a dangling reference", () => {
    const doc = financeWorkbook();
    doc.units[0]!.exercise_ids = ["missing"];
    const r = validateWorkbook(doc);
    expect(r.errors.some((e) => e.category === "refs" && e.message.includes("missing"))).toBe(true);
  });

  it("refuses a scored self-check in a wellbeing title", () => {
    const r = validateWorkbook(
      financeWorkbook({
        genre: "wellbeing",
        safety_tier: "standard",
        advice_guardrail: undefined,
        selfcheck: {
          intro: "A few questions.",
          scale_labels: ["a", "b", "c", "d", "e"],
          areas: [{ id: "sleep", label: "Sleep" }, { id: "mood", label: "Mood" }],
          items: [
            { id: "i1", area: "sleep", text: "x" },
            { id: "i2", area: "sleep", text: "x" },
            { id: "i3", area: "mood", text: "x" },
            { id: "i4", area: "mood", text: "x" },
          ],
          result_note: "A personal check, not a diagnosis.",
          scored: true,
        },
      }),
      { lenient: true },
    );
    expect(r.errors.some((e) => e.path === "selfcheck.scored")).toBe(true);
  });

  it("never allows a streak trigger", () => {
    const r = validateWorkbook(financeWorkbook({ milestones: [{ id: "m1", trigger: "days_in_a_row:7", message: "x" }] }));
    expect(r.ok).toBe(false);
  });
});

describe("v3 field settings (F-113)", () => {
  type Fields = WorkbookV3Input["exercises"][number]["fields"];
  const withFields = (fields: Fields) => {
    const wb = financeWorkbook();
    return { ...wb, exercises: wb.exercises.map((e, i) => (i === 0 ? { ...e, fields } : e)) };
  };
  const messages = (fields: Fields) => {
    const r = validateWorkbook(withFields(fields));
    return { errors: r.errors.map((e) => e.message), warnings: r.warnings.map((w) => w.message) };
  };

  it("passes well-formed number, currency, table and decision matrix fields", () => {
    const r = validateWorkbook(
      withFields([
        { id: "takings", type: "currency", label: "Money in today", unit: "NGN", min: 0 },
        { id: "hours", type: "number", label: "Hours open", unit: "hours", min: 0, max: 24, step: 1 },
        { id: "costs", type: "table", label: "Costs", columns: ["Item", "Amount"], computed: "sum", unit: "NGN", min_items: 2, max_items: 10 },
        { id: "pick", type: "decision_matrix", label: "Which stall", columns: ["Footfall", "Rent", "Safety"], computed: "weighted_sum", min_items: 2, max_items: 4 },
      ]),
    );
    expect(r.errors).toEqual([]);
  });

  it("needs a real currency code on a currency field", () => {
    expect(messages([{ id: "takings", type: "currency", label: "Money in" }]).errors.join()).toContain("three-letter currency code");
    expect(messages([{ id: "takings", type: "currency", label: "Money in", unit: "naira" }]).errors.join()).toContain("three-letter currency code");
  });

  it("rejects min above max", () => {
    expect(messages([{ id: "takings", type: "currency", label: "Money in", unit: "GBP", min: 10, max: 5 }]).errors.join()).toContain("min 10 is above max 5");
  });

  it("checks table columns, row bounds and computed", () => {
    const { errors } = messages([
      { id: "takings", type: "currency", label: "Money in", unit: "GBP" },
      { id: "t1", type: "table", label: "No columns" },
      { id: "t2", type: "table", label: "Weighted", columns: ["A", "B"], computed: "weighted_sum" },
      { id: "t3", type: "table", label: "Too many", columns: ["A", "B"], max_items: 50 },
      { id: "t4", type: "table", label: "Upside down", columns: ["A", "B"], min_items: 4, max_items: 2 },
    ]);
    expect(errors).toEqual(
      expect.arrayContaining([
        "a table needs columns (2 to 6 headings)",
        "weighted_sum is for decision matrices; a table can use sum or mean",
        "max_items on a table must be 20 or fewer",
        "min_items is above max_items",
      ]),
    );
  });

  it("checks decision matrix criteria, options and scale", () => {
    const { errors } = messages([
      { id: "takings", type: "currency", label: "Money in", unit: "GBP" },
      { id: "m1", type: "decision_matrix", label: "No criteria", options: ["A", "B"] },
      { id: "m2", type: "decision_matrix", label: "One option", columns: ["X", "Y"], options: ["A"] },
      { id: "m3", type: "decision_matrix", label: "Bad scale", columns: ["X", "Y"], min: 3, max: 3 },
    ]);
    expect(errors).toEqual(
      expect.arrayContaining([
        "a decision matrix needs columns, one per criterion (2 to 6)",
        "a decision matrix compares 2 to 8 options, got 1",
        "a decision matrix scale needs whole numbers with 0 <= min < max <= 10",
      ]),
    );
  });

  it("warns when a figure is prefilled from something that is not a figure", () => {
    const wb = financeWorkbook();
    const patched = {
      ...wb,
      exercises: wb.exercises.map((e) =>
        e.id === "weekly_count" ? { ...e, fields: [{ id: "total", type: "number" as const, label: "Week total", prefill_from: "note" }] } : e,
      ),
    };
    const r = validateWorkbook(patched);
    expect(r.warnings.some((w) => w.category === "refs" && w.message.includes("prefill_from note"))).toBe(true);
  });
});
