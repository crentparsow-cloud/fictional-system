import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Field } from "@akana/schema";
import { FieldRenderer } from "../FieldRenderer";
import { defaultValue, isAnswered, UnknownFieldError, type FieldValue } from "../types";

afterEach(cleanup);

function mount(field: Field, value?: FieldValue) {
  const onChange = vi.fn();
  const view = render(<FieldRenderer field={field} value={value} onChange={onChange} />);
  return { onChange, view };
}

describe("field components", () => {
  it("short_text renders a labelled input and reports typing", () => {
    const field: Field = { id: "f1", type: "short_text", label: "One win", help: "Small counts." };
    const { onChange } = mount(field);
    const input = screen.getByLabelText("One win") as HTMLInputElement;
    expect(screen.getByText("Small counts.")).toBeTruthy();
    fireEvent.change(input, { target: { value: "Got up on time" } });
    expect(onChange).toHaveBeenCalledWith("Got up on time");
  });

  it("long_text renders a textarea and reports typing", () => {
    const field: Field = { id: "f2", type: "long_text", label: "Write it out", optional: true };
    const { onChange } = mount(field);
    const area = screen.getByLabelText(/Write it out/) as HTMLTextAreaElement;
    expect(area.tagName).toBe("TEXTAREA");
    expect(screen.getByText("(optional)")).toBeTruthy();
    fireEvent.change(area, { target: { value: "A longer note" } });
    expect(onChange).toHaveBeenCalledWith("A longer note");
  });

  it("time_of_day renders a time input", () => {
    const field: Field = { id: "f3", type: "time_of_day", label: "Wake time" };
    const { onChange } = mount(field);
    const input = screen.getByLabelText("Wake time") as HTMLInputElement;
    expect(input.type).toBe("time");
    fireEvent.change(input, { target: { value: "07:30" } });
    expect(onChange).toHaveBeenCalledWith("07:30");
  });

  it("scale_0_10 renders eleven chips and sets a number", () => {
    const field: Field = { id: "f4", type: "scale_0_10", label: "How was the week?" };
    const { onChange } = mount(field);
    const group = screen.getByRole("group", { name: "How was the week?" });
    const chips = group.querySelectorAll("button");
    expect(chips).toHaveLength(11);
    fireEvent.click(screen.getByRole("button", { name: "7 out of 10" }));
    expect(onChange).toHaveBeenCalledWith(7);
  });

  it("scale_0_10 clears when the pressed chip is pressed again", () => {
    const field: Field = { id: "f4b", type: "scale_0_10", label: "Again" };
    const { onChange } = mount(field, 3);
    const chip = screen.getByRole("button", { name: "3 out of 10" });
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(chip);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("checklist renders one checkbox per option and toggles by index", () => {
    const field: Field = { id: "f5", type: "checklist", label: "Tools used", options: ["Pause", "Walk", "Note"] };
    const { onChange } = mount(field);
    fireEvent.click(screen.getByLabelText("Walk"));
    expect(onChange).toHaveBeenCalledWith([false, true, false]);
  });

  it("ranked_list renders max_items inputs with numbered labels", () => {
    const field: Field = { id: "f6", type: "ranked_list", label: "Top three", max_items: 3, min_items: 1 };
    const { onChange } = mount(field);
    expect(screen.getByLabelText("Top three 1")).toBeTruthy();
    expect(screen.getByLabelText("Top three 3")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Top three 2"), { target: { value: "Sleep" } });
    expect(onChange).toHaveBeenCalledWith(["", "Sleep", ""]);
  });

  it("two_column renders two headed columns and fills a cell", () => {
    const field: Field = { id: "f7", type: "two_column", label: "Skill and moment", columns: ["The skill", "A moment"] };
    const { onChange } = mount(field);
    fireEvent.change(screen.getByLabelText("A moment 2"), { target: { value: "Thursday night" } });
    expect(onChange).toHaveBeenCalledWith([
      ["", ""],
      ["", "Thursday night"],
    ]);
  });

  it("two_column offers another row once the last one has text", () => {
    const field: Field = { id: "f7b", type: "two_column", label: "Pairs", columns: ["A", "B"] };
    const { onChange } = mount(field, [
      ["x", ""],
      ["y", ""],
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Add another row" }));
    expect(onChange).toHaveBeenCalledWith([
      ["x", ""],
      ["y", ""],
      ["", ""],
    ]);
  });

  it("rating_grid renders a row of five per item and rates one row", () => {
    const field: Field = { id: "f8", type: "rating_grid", label: "Rate each skill", rows: ["Pausing", "Planning"] };
    const { onChange } = mount(field);
    expect(screen.getByText("1 is often hard. 5 is usually fine.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Planning: 4 out of 5" }));
    expect(onChange).toHaveBeenCalledWith([null, 4]);
  });

  it("weekly_grid without rows toggles a day", () => {
    const field: Field = { id: "f9", type: "weekly_grid", label: "Days you planned" };
    const { onChange } = mount(field);
    fireEvent.click(screen.getByRole("button", { name: "Wednesday" }));
    expect(onChange).toHaveBeenCalledWith([false, false, true, false, false, false, false]);
  });

  it("weekly_grid with rows picks a day then rates a row", () => {
    const field: Field = { id: "f9b", type: "weekly_grid", label: "Focus by day", rows: ["Morning", "Afternoon"] };
    const { onChange } = mount(field);
    fireEvent.click(screen.getByRole("button", { name: "Tuesday" }));
    fireEvent.click(screen.getByRole("button", { name: "Tuesday, Afternoon: 2 out of 5" }));
    const expected: (number | null)[][] = Array.from({ length: 7 }, () => [null, null]);
    expected[1] = [null, 2];
    expect(onChange).toHaveBeenCalledWith(expected);
  });

  it("yes_no offers Yes and Not yet", () => {
    const field: Field = { id: "f10", type: "yes_no", label: "Did you try it?" };
    const { onChange } = mount(field);
    fireEvent.click(screen.getByRole("button", { name: "Not yet" }));
    expect(onChange).toHaveBeenCalledWith("no");
  });

  it("read-only chips are disabled", () => {
    const field: Field = { id: "f11", type: "yes_no", label: "Locked" };
    render(<FieldRenderer field={field} value="yes" onChange={() => undefined} readOnly />);
    expect((screen.getByRole("button", { name: "Yes" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("number and currency render a real input, not the placeholder", () => {
    for (const type of ["number", "currency", "table", "decision_matrix"] as const) {
      const { view } = mount({ id: `p_${type}`, type, label: `A ${type}`, columns: ["A", "B"] });
      expect(view.container.querySelector("[data-pending-field]")).toBeNull();
      expect(view.container.querySelector(`[data-field-type="${type}"]`)).toBeTruthy();
      cleanup();
    }
  });

  it("an unknown type throws UnknownFieldError", () => {
    const field = { id: "zz", type: "hologram", label: "Nope" } as unknown as Field;
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<FieldRenderer field={field} value={undefined} onChange={() => undefined} />)).toThrow(UnknownFieldError);
    spy.mockRestore();
  });
});

describe("defaultValue and isAnswered", () => {
  it("gives each type a starting shape", () => {
    expect(defaultValue({ id: "a", type: "short_text", label: "" })).toBe("");
    expect(defaultValue({ id: "a", type: "scale_0_10", label: "" })).toBeNull();
    expect(defaultValue({ id: "a", type: "checklist", label: "", options: ["x", "y"] })).toEqual([false, false]);
    expect(defaultValue({ id: "a", type: "ranked_list", label: "", max_items: 4 })).toEqual(["", "", "", ""]);
    expect(defaultValue({ id: "a", type: "rating_grid", label: "", rows: ["r"] })).toEqual([null]);
    expect(defaultValue({ id: "a", type: "weekly_grid", label: "" })).toHaveLength(7);
  });

  it("treats optional fields as answered and blank text as not", () => {
    expect(isAnswered({ id: "a", type: "short_text", label: "", optional: true }, undefined)).toBe(true);
    expect(isAnswered({ id: "a", type: "short_text", label: "" }, "   ")).toBe(false);
    expect(isAnswered({ id: "a", type: "rating_grid", label: "", rows: ["r", "s"] }, [1, null])).toBe(false);
    expect(isAnswered({ id: "a", type: "rating_grid", label: "", rows: ["r", "s"] }, [1, 5])).toBe(true);
  });
});
