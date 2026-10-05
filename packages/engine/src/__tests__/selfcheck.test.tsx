import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WorkbookV3, stripInternal } from "@akana/schema";
import { SelfCheckScreen, type SelfCheckAnswers } from "../screens/SelfCheck";

afterEach(cleanup);

const focus = WorkbookV3.parse(
  stripInternal(JSON.parse(readFileSync(resolve(__dirname, "../../../../content/workbooks/v3/focus.json"), "utf8"))),
);

describe("self-check screen", () => {
  it("shows every item and the result note, and never a total, score or band", () => {
    const sc = focus.selfcheck;
    if (!sc) throw new Error("focus has no self-check");
    // Every item answered at the top of the scale, the case where a score would be most tempting to show.
    const answers: SelfCheckAnswers = Object.fromEntries(sc.items.map((i) => [i.id, 4]));
    const { container } = render(<SelfCheckScreen selfcheck={sc} answers={answers} onChange={() => undefined} onFinish={() => undefined} />);
    const text = container.textContent ?? "";

    for (const item of sc.items) expect(text).toContain(item.text);
    expect(text).toContain(sc.result_note);

    // Take the author's own words out. Whatever is left is the engine's, and it must hold no digit at all.
    let engineText = text;
    for (const s of [sc.intro, sc.result_note, ...sc.items.map((i) => i.text), ...sc.areas.map((a) => a.label), ...sc.scale_labels]) {
      engineText = engineText.split(s).join(" ");
    }
    expect(engineText).not.toMatch(/\d/);
    expect(engineText).not.toMatch(/\b(total|score|scored|band|points|average|out of)\b/i);
    expect(container.querySelector("progress, meter")).toBeNull();

    // The finish button is enabled only when everything is answered.
    expect((screen.getByRole("button", { name: "Finish" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps Finish disabled until every item has an answer, and reports a choice", () => {
    const sc = focus.selfcheck;
    if (!sc) throw new Error("focus has no self-check");
    const onChange = vi.fn();
    render(<SelfCheckScreen selfcheck={sc} answers={{}} onChange={onChange} onFinish={() => undefined} />);
    expect((screen.getByRole("button", { name: "Finish" }) as HTMLButtonElement).disabled).toBe(true);
    const firstItem = sc.items[0];
    if (!firstItem) throw new Error("no items");
    const group = screen.getByRole("group", { name: firstItem.text });
    const option = group.querySelector("button");
    if (!option) throw new Error("no option");
    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledWith({ [firstItem.id]: 0 });
  });
});
