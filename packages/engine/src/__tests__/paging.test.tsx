import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WorkbookV3, stripInternal } from "@akana/schema";
import { Player } from "../Player";
import { ExerciseScreen, exercisePages } from "../screens/Exercise";
import { MemoryAnswerStore } from "../store";
import { isAnswered, resolveField } from "../types";

afterEach(cleanup);

const doc = WorkbookV3.parse(stripInternal(JSON.parse(readFileSync(resolve(__dirname, "../../../../content/workbooks/v3/focus.json"), "utf8"))));
const withExample = doc.exercises.find((e) => e.example && e.short_version) ?? doc.exercises[0]!;

describe("Exercise paging (F-015 parity)", () => {
  it("pages full and short versions in the legacy order", () => {
    expect(exercisePages({ example: { character: "A", text: "B" } }, "full")).toEqual(["purpose", "steps", "example", "yours", "done"]);
    expect(exercisePages({ example: undefined }, "full")).toEqual(["purpose", "steps", "yours", "done"]);
    expect(exercisePages({ example: { character: "A", text: "B" } }, "short")).toEqual(["steps", "yours", "done"]);
  });

  it("shows one part per screen with dots, Back and Next, and moves focus to the new part", () => {
    const onClose = vi.fn();
    const { container } = render(
      <ExerciseScreen exercise={withExample} store={new MemoryAnswerStore()} paged onClose={onClose} closeLabel="Back to Week 1" onDone={() => undefined} />,
    );
    const pages = exercisePages(withExample, "full");
    // Dots carry no numbers and are hidden from screen readers; the heading says the part.
    const dots = container.querySelectorAll(".ak-dot");
    expect(dots.length).toBe(pages.length);
    expect(container.querySelector(".ak-dots")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".ak-dots")?.textContent).toBe("");
    expect(screen.getByRole("heading", { level: 3 }).textContent).toContain(`Part 1 of ${pages.length}`);
    expect(screen.queryByRole("heading", { name: /Your turn/ })).toBeNull();

    // First page: the way out, not Back.
    fireEvent.click(screen.getByRole("button", { name: "Back to Week 1" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "See the steps" }));
    const h = screen.getByRole("heading", { level: 3, name: /The steps/ });
    expect(h.textContent).toContain(`Part 2 of ${pages.length}`);
    expect(document.activeElement).toBe(h);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { level: 3 }).textContent).toContain("Part 1");
  });

  it("keeps Done disabled until the fields are answered, then shows the done page", () => {
    const onDone = vi.fn();
    const ex = doc.exercises.find((e) => !e.example) ?? withExample;
    render(<ExerciseScreen exercise={ex} store={new MemoryAnswerStore()} paged onDone={onDone} defaultMode="full" />);
    const pages = exercisePages(ex, "full");
    for (let i = 0; i < pages.indexOf("yours"); i++) {
      const next = screen.getAllByRole("button").find((b) => ["See the steps", "See an example", "Your turn"].includes(b.textContent ?? ""));
      fireEvent.click(next!);
    }
    expect(screen.getByRole("heading", { level: 3, name: /Your turn/ })).toBeTruthy();
    const done = screen.getByRole("button", { name: "Done" }) as HTMLButtonElement;
    const ready = ex.fields.every((f) => isAnswered(resolveField(f, []), undefined));
    expect(done.disabled).toBe(!ready);
  });

  it("read only stops at Your turn without a Done button", () => {
    const short = doc.exercises.find((e) => e.short_version) ?? withExample;
    render(<ExerciseScreen exercise={short} store={new MemoryAnswerStore()} paged readOnly defaultMode="short" onDone={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Your turn" }));
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    expect(screen.getByText("Read only")).toBeTruthy();
  });

  it("the Player lists a unit's exercises and opens one at a time when paged", () => {
    render(<Player workbook={doc} store={new MemoryAnswerStore()} initialView={{ kind: "unit", number: 1 }} pagedExercises />);
    const unit = doc.units.find((u) => u.number === 1)!;
    const first = doc.exercises.find((e) => e.id === unit.exercise_ids[0])!;
    expect(screen.getByRole("heading", { level: 3, name: first.title })).toBeTruthy();
    // Nothing to fill in on the list.
    expect(document.querySelector(".ak-answers")).toBeNull();
    const startButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".ak-ex-list button")).filter((b) => /^(Start|Full version)/.test(b.textContent ?? ""));
    fireEvent.click(startButtons[0]!);
    expect(screen.getByRole("navigation", { name: "Exercise pages" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to Week 1" }));
    expect(screen.queryByRole("navigation", { name: "Exercise pages" })).toBeNull();
  });
});
