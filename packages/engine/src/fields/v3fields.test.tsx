import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import type { Field } from "@akana/schema";
import { FieldRenderer } from "../FieldRenderer";
import { ExerciseScreen } from "../screens/Exercise";
import { prefillFor, answerText } from "../progress";
import { MemoryAnswerStore } from "../store";
import { coerceValue, defaultValue, isAnswered, type DecisionMatrixValue, type FieldValue, type TableValue } from "../types";
import {
  coerceMatrix,
  coerceTable,
  formatNumber,
  matrixLeaders,
  matrixScores,
  normaliseNumber,
  parseNumberInput,
  printableValue,
  tableTotals,
} from "../values";
import { financeDemo } from "../__tests__/fixtures/finance-demo";

afterEach(cleanup);

/** A controlled host, so the field sees its own changes like it does in the app. */
function Host({ field, initial, spy, readOnly }: { field: Field; initial?: FieldValue; spy?: (v: FieldValue) => void; readOnly?: boolean }) {
  const [v, setV] = useState<FieldValue | undefined>(initial);
  return (
    <FieldRenderer
      field={field}
      value={v}
      readOnly={readOnly}
      onChange={(next) => {
        setV(next);
        spy?.(next);
      }}
    />
  );
}

const flushFrames = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));

describe("parseNumberInput and formatting", () => {
  it("reads what people type", () => {
    expect(parseNumberInput("")).toEqual({ ok: true, value: null });
    expect(parseNumberInput("1,250.50")).toEqual({ ok: true, value: 1250.5 });
    expect(parseNumberInput("£12")).toEqual({ ok: true, value: 12 });
    expect(parseNumberInput(" -3 ")).toEqual({ ok: true, value: -3 });
    expect(parseNumberInput("(40)")).toEqual({ ok: true, value: -40 });
    expect(parseNumberInput("NGN 5 000")).toEqual({ ok: true, value: 5000 });
    expect(parseNumberInput(".5")).toEqual({ ok: true, value: 0.5 });
    expect(parseNumberInput("12abc4").ok).toBe(false);
    expect(parseNumberInput("1.2.3").ok).toBe(false);
  });

  it("rounds money to the currency's minor units", () => {
    expect(normaliseNumber({ type: "currency", label: "", unit: "GBP" }, 12.345)).toBe(12.35);
    expect(normaliseNumber({ type: "currency", label: "", unit: "JPY" }, 1234.6)).toBe(1235);
    expect(normaliseNumber({ type: "number", label: "", step: 1 }, 2.5)).toBe(2.5);
    expect(normaliseNumber({ type: "number", label: "" }, 0.1 + 0.2)).toBe(0.3);
    expect(formatNumber({ type: "currency", label: "", unit: "GBP" }, 1250)).toBe("£1,250.00");
    expect(formatNumber({ type: "number", label: "", unit: "months" }, 3)).toBe("3 months");
  });
});

describe("number field", () => {
  it("is a labelled decimal text box that saves a number", () => {
    const spy = vi.fn();
    render(<Host field={{ id: "n1", type: "number", label: "Hours worked", unit: "hours" }} spy={spy} />);
    const input = screen.getByLabelText("Hours worked") as HTMLInputElement;
    expect(input.type).toBe("text");
    expect(input.inputMode).toBe("decimal");
    expect(input.getAttribute("aria-describedby")).toContain("n1-unit");
    fireEvent.change(input, { target: { value: "1,250" } });
    expect(spy).toHaveBeenLastCalledWith(1250);
    fireEvent.change(input, { target: { value: "" } });
    expect(spy).toHaveBeenLastCalledWith(null);
  });

  it("keeps an out-of-range figure on screen with a message and saves nothing", () => {
    const spy = vi.fn();
    render(<Host field={{ id: "n2", type: "number", label: "Months", min: 0, max: 24 }} spy={spy} />);
    const input = screen.getByLabelText("Months") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "30" } });
    expect(spy).not.toHaveBeenCalled();
    expect(input.value).toBe("30");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Use a figure from 0 to 24.")).toBeTruthy();
    fireEvent.change(input, { target: { value: "abc" } });
    expect(screen.getByText(/Use numbers only/)).toBeTruthy();
    fireEvent.change(input, { target: { value: "12" } });
    expect(spy).toHaveBeenLastCalledWith(12);
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });

  it("steps with the arrow keys and stays within bounds", () => {
    const spy = vi.fn();
    render(<Host field={{ id: "n3", type: "number", label: "Count", min: 0, max: 5 }} initial={4} spy={spy} />);
    const input = screen.getByLabelText("Count");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(spy).toHaveBeenLastCalledWith(5);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(spy).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(input, { key: "ArrowDown", shiftKey: true });
    expect(spy).toHaveBeenLastCalledWith(0);
  });

  it("asks for a whole number when the step is whole", () => {
    render(<Host field={{ id: "n4", type: "number", label: "People", step: 1 }} />);
    fireEvent.change(screen.getByLabelText("People"), { target: { value: "2.5" } });
    expect(screen.getByText("Use a whole number.")).toBeTruthy();
  });
});

describe("currency field", () => {
  it("shows the symbol, rounds to pence and formats on blur", () => {
    const spy = vi.fn();
    const { container } = render(<Host field={{ id: "c1", type: "currency", label: "Take-home pay", unit: "GBP", min: 0 }} spy={spy} />);
    expect(container.querySelector(".ak-num-affix")?.textContent).toBe("£");
    expect(screen.getByText("Amount in GBP.")).toBeTruthy();
    const input = screen.getByLabelText("Take-home pay") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "2150.456" } });
    expect(spy).toHaveBeenLastCalledWith(2150.46);
    fireEvent.blur(input);
    expect(input.value).toBe("2,150.46");
    fireEvent.change(input, { target: { value: "-5" } });
    expect(screen.getByText("Use a figure of £0.00 or more.")).toBeTruthy();
  });

  it("shows a saved amount formatted", () => {
    render(<Host field={{ id: "c2", type: "currency", label: "Rent", unit: "GBP" }} initial={950} />);
    expect((screen.getByLabelText("Rent") as HTMLInputElement).value).toBe("950.00");
  });
});

describe("table field", () => {
  const budget: Field = { id: "t1", type: "table", label: "Outgoings", columns: ["Item", "Amount"], computed: "sum", unit: "GBP", min_items: 2, max_items: 3 };

  it("starts with min_items rows, headed columns and labelled cells", () => {
    render(<Host field={budget} />);
    const table = screen.getByRole("table", { name: "Outgoings" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Item", "Amount", "Remove"]);
    expect(screen.getByLabelText("Item, Row 1")).toBeTruthy();
    expect(screen.getByLabelText("Amount, Row 2")).toBeTruthy();
    expect(screen.queryByLabelText("Item, Row 3")).toBeNull();
    // At the minimum, rows cannot be removed.
    expect(screen.queryByRole("button", { name: "Remove row 1" })).toBeNull();
  });

  it("adds a row, moves focus into it, and stops at max_items", async () => {
    const spy = vi.fn();
    render(<Host field={budget} spy={spy} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a row" }));
    await flushFrames();
    expect(document.activeElement).toBe(screen.getByLabelText("Item, Row 3"));
    expect((spy.mock.lastCall?.[0] as TableValue).length).toBe(3);
    expect(screen.queryByRole("button", { name: "Add a row" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove row 3" }));
    await flushFrames();
    expect(document.activeElement).toBe(screen.getByLabelText("Item, Row 2"));
  });

  it("saves text and numbers per cell and totals money exactly", () => {
    const spy = vi.fn();
    const { container } = render(<Host field={budget} spy={spy} />);
    fireEvent.change(screen.getByLabelText("Item, Row 1"), { target: { value: "Rent" } });
    fireEvent.change(screen.getByLabelText("Amount, Row 1"), { target: { value: "0.10" } });
    fireEvent.change(screen.getByLabelText("Amount, Row 2"), { target: { value: "0.20" } });
    expect(spy).toHaveBeenLastCalledWith([
      ["Rent", 0.1],
      ["", 0.2],
    ]);
    const total = container.querySelector("tfoot output");
    expect(total?.textContent).toBe("£0.30");
    expect(total?.getAttribute("aria-label")).toBe("Total, Amount");
  });

  it("takes fixed rows from field.rows as row headers, with no add or remove", () => {
    const field: Field = { id: "t2", type: "table", label: "Week", columns: ["Day", "Spent"], rows: ["Monday", "Tuesday"], computed: "mean" };
    render(<Host field={field} />);
    expect(screen.getByRole("rowheader", { name: "Monday" })).toBeTruthy();
    expect(screen.getByLabelText("Spent, Tuesday")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add a row" })).toBeNull();
    expect(screen.getByRole("rowheader", { name: "Average" })).toBeTruthy();
  });

  it("coerces drifted shapes and counts as answered once a row has content", () => {
    expect(defaultValue(budget)).toEqual([
      ["", null],
      ["", null],
    ]);
    // Extra columns are dropped, numeric strings become numbers, rows are padded to the minimum.
    expect(coerceTable(budget, [["Food", "12.50", "extra"]])).toEqual([
      ["Food", 12.5],
      ["", null],
    ]);
    expect(coerceValue(budget, "nonsense" as unknown as FieldValue)).toEqual(defaultValue(budget));
    expect(isAnswered(budget, undefined)).toBe(false);
    expect(isAnswered(budget, [["", 4], ["", null]])).toBe(true);
    expect(tableTotals(budget, [["a", 10.1], ["b", 20.2]])).toEqual([null, 30.3]);
  });

  it("is read-only when asked", () => {
    render(<Host field={budget} initial={[["Rent", 900], ["Food", 200]]} readOnly />);
    expect((screen.getByLabelText("Item, Row 1") as HTMLInputElement).readOnly).toBe(true);
    expect(screen.queryByRole("button", { name: "Add a row" })).toBeNull();
  });
});

describe("decision matrix field", () => {
  const matrix: Field = {
    id: "m1",
    type: "decision_matrix",
    label: "Your options",
    columns: ["Cost", "Flexibility"],
    computed: "weighted_sum",
    min_items: 2,
    max_items: 3,
  };

  it("lets the reader name options, set importances and score with selects", () => {
    const spy = vi.fn();
    render(<Host field={matrix} spy={spy} />);
    expect(screen.getByRole("group", { name: "Your options" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Option 1, name"), { target: { value: "Stay put" } });
    fireEvent.change(screen.getByLabelText("Option 2, name"), { target: { value: "Move" } });
    const cost = screen.getByLabelText("Cost, Stay put") as HTMLSelectElement;
    expect(cost.tagName).toBe("SELECT");
    expect([...cost.options].map((o) => o.textContent)).toEqual(["Not scored", "1", "2", "3", "4", "5"]);
    fireEvent.change(screen.getByLabelText("Cost", { selector: "#m1-w0" }), { target: { value: "3" } });
    fireEvent.change(cost, { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Flexibility, Stay put"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Cost, Move"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Flexibility, Move"), { target: { value: "5" } });
    const last = spy.mock.lastCall?.[0] as DecisionMatrixValue;
    expect(last).toEqual({ options: ["Stay put", "Move"], weights: [3, null], scores: [[4, 2], [2, 5]] });
    // Stay put: 4*3 + 2*1 = 14. Move: 2*3 + 5*1 = 11.
    expect(screen.getByText(/Highest score so far: Stay put\. The score is a guide\. The choice is yours\./)).toBeTruthy();
    expect(isAnswered(matrix, last)).toBe(true);
  });

  it("adds and removes options within bounds", async () => {
    const spy = vi.fn();
    render(<Host field={matrix} spy={spy} />);
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add an option" }));
    await flushFrames();
    expect(document.activeElement).toBe(screen.getByLabelText("Option 3, name"));
    expect(screen.queryByRole("button", { name: "Add an option" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove Option 3" }));
    expect((spy.mock.lastCall?.[0] as DecisionMatrixValue).options).toHaveLength(2);
  });

  it("uses author options as legends and a custom scale", () => {
    const field: Field = { id: "m2", type: "decision_matrix", label: "Pick", options: ["A", "B"], columns: ["X", "Y"], min: 0, max: 3 };
    render(<Host field={field} />);
    expect(screen.queryByLabelText(/Option 1, name/)).toBeNull();
    const sel = screen.getByLabelText("X, A") as HTMLSelectElement;
    expect([...sel.options].map((o) => o.value)).toEqual(["", "0", "1", "2", "3"]);
    expect(screen.getByText("Score each option from 0 to 3. 3 fits best.")).toBeTruthy();
    expect(screen.queryByText("How much each one matters")).toBeNull();
  });

  it("scores sum, mean and weighted_sum, reports ties, and coerces drift", () => {
    const base = { id: "m3", type: "decision_matrix" as const, label: "", options: ["A", "B"], columns: ["X", "Y"] };
    const v: DecisionMatrixValue = { options: ["A", "B"], weights: [2, null], scores: [[3, 4], [5, 2]] };
    expect(matrixScores(base, v).map((o) => o.score)).toEqual([7, 7]);
    expect(matrixLeaders(base, v).map((o) => o.name)).toEqual(["A", "B"]);
    expect(matrixScores({ ...base, computed: "mean" }, v).map((o) => o.score)).toEqual([3.5, 3.5]);
    expect(matrixScores({ ...base, computed: "weighted_sum" }, v).map((o) => o.score)).toEqual([10, 12]);
    // Out-of-scale scores and stray keys are dropped; author options win over stored names.
    expect(coerceMatrix(base, { options: ["zz"], weights: [9], scores: [[6, 1]], extra: true })).toEqual({
      options: ["A", "B"],
      weights: [null, null],
      scores: [[null, 1], [null, null]],
    });
    expect(isAnswered({ ...base }, { options: ["A", "B"], weights: [], scores: [[1, 1], [1, null]] })).toBe(false);
  });
});

describe("printing and plain text", () => {
  it("prints a money table with its total and a matrix with its leader", () => {
    const table: Field = { id: "t", type: "table", label: "Out", columns: ["Item", "Amount"], computed: "sum", unit: "GBP" };
    expect(printableValue(table, [["Rent", 900], ["", null], ["Food", 150.5]])).toEqual({
      kind: "table",
      head: ["Item", "Amount"],
      rows: [
        ["Rent", "£900.00"],
        ["Food", "£150.50"],
      ],
      foot: ["Total", "£1,050.50"],
      caption: null,
    });
    const matrix: Field = { id: "m", type: "decision_matrix", label: "M", columns: ["X"], options: ["A", "B"] };
    const p = printableValue(matrix, { options: ["A", "B"], weights: [], scores: [[2], [4]] });
    expect(p.kind === "table" && p.caption).toBe("Highest score: B");
    expect(answerText(matrix, { options: ["A", "B"], weights: [], scores: [[2], [4]] })).toBe("Highest score: B");
    expect(answerText({ id: "c", type: "currency", label: "", unit: "GBP" }, 12)).toBe("£12.00");
    expect(printableValue(table, undefined)).toEqual({ kind: "lines", lines: [] });
  });
});

describe("finance demo fixture (F-113)", () => {
  const mapEx = financeDemo.exercises.find((e) => e.id === "month_map")!;
  const weighEx = financeDemo.exercises.find((e) => e.id === "weigh_choice")!;

  it("parses as a v3 workbook using all four new field types", () => {
    const types = new Set(financeDemo.exercises.flatMap((e) => e.fields.map((f) => f.type)));
    for (const t of ["number", "currency", "table", "decision_matrix"]) expect(types.has(t as never)).toBe(true);
    expect(financeDemo.advice_guardrail).toBe("not_financial_advice");
  });

  it("enables Done only when the required money fields are filled", () => {
    const store = new MemoryAnswerStore();
    const onDone = vi.fn();
    const view = render(<ExerciseScreen exercise={mapEx} store={store} onDone={onDone} />);
    const done = () => screen.getByRole("button", { name: "Done" }) as HTMLButtonElement;
    expect(done().disabled).toBe(true);
    store.set("month_map", "take_home", 2100);
    store.set("month_map", "outgoings", [["Rent", 900], ["Food", 250]]);
    view.rerender(<ExerciseScreen exercise={mapEx} store={store} onDone={onDone} />);
    // buffer_months is optional, so it does not hold the reader back.
    expect(done().disabled).toBe(false);
  });

  it("prefills a currency field from an earlier table's total", () => {
    const store = new MemoryAnswerStore();
    store.set("month_map", "outgoings", [["Rent", 900], ["Food", 250.25]]);
    const target = weighEx.fields.find((f) => f.id === "monthly_costs")!;
    expect(prefillFor(financeDemo, "weigh_choice", target, store)).toBe(1150.25);
    const prefill = (f: Field) => prefillFor(financeDemo, weighEx.id, f, store);
    const view = render(<ExerciseScreen exercise={weighEx} store={store} prefill={prefill} />);
    expect(store.get("weigh_choice", "monthly_costs")).toBe(1150.25);
    // The app re-renders on a store write; here we do it by hand.
    view.rerender(<ExerciseScreen exercise={weighEx} store={store} prefill={prefill} />);
    expect((screen.getByLabelText(/Your monthly costs, from week 1/) as HTMLInputElement).value).toBe("1,150.25");
  });

  it("keeps every saved shape plain JSON that survives a round trip", () => {
    const values: [string, FieldValue][] = [
      ["take_home", 2100.5],
      ["outgoings", [["Rent", 900], ["Food", null]]],
      ["choice", { options: ["Stay", "Move"], weights: [5, 2, null], scores: [[4, 3, 5], [2, 5, 3]] }],
    ];
    for (const [id, v] of values) {
      const field = [...mapEx.fields, ...weighEx.fields].find((f) => f.id === id)!;
      const round = JSON.parse(JSON.stringify(v)) as FieldValue;
      expect(coerceValue(field, round)).toEqual(coerceValue(field, v));
      expect(JSON.stringify(v).length).toBeLessThan(32 * 1024);
    }
  });
});
