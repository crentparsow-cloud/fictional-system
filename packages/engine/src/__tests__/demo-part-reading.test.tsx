import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WorkbookV3, stripInternal } from "@akana/schema";
import { Player } from "../Player";
import { MemoryAnswerStore } from "../store";

afterEach(cleanup);

/**
 * A demo part (structure.unit "part", key ideas with no example, no source):
 * the reading tools find paragraphs by data-ra, so every piece of reading on
 * the part must carry it, and an idea with no example must not leave an empty
 * paragraph behind for the marker to land on.
 */
const doc = WorkbookV3.parse(stripInternal(JSON.parse(readFileSync(resolve(__dirname, "../../../../content/workbooks/demo/a-polite-no-dj4fc.json"), "utf8"))));

describe("reading on a demo part", () => {
  it("marks the focus, intro, each idea, each exercise purpose and the takeaway as reading", () => {
    const part = doc.units[0]!;
    const { container } = render(<Player workbook={doc} store={new MemoryAnswerStore()} initialView={{ kind: "unit", number: 1 }} pagedExercises />);
    const screen = container.querySelector<HTMLElement>(".ak-player-body .ak-screen")!;
    expect(screen.classList.contains("ak-unit")).toBe(true);
    expect(screen.dataset.unit).toBe("1");
    const ra = [...screen.querySelectorAll<HTMLElement>("[data-ra]")];
    const ideas = part.ideas ?? [];
    expect(ideas.length).toBeGreaterThan(0);
    expect(ra).toHaveLength(1 + (part.intro ? 1 : 0) + ideas.length * 2 + part.exercise_ids.length + (part.takeaway ? 1 : 0));
    expect(ra.every((el) => (el.textContent ?? "").trim().length > 0)).toBe(true);
    expect(screen.querySelector(".ak-idea-example")).toBeNull();
  });
});
