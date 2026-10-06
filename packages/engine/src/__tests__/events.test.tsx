import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WorkbookV3, stripInternal } from "@akana/schema";
import { Player } from "../Player";
import { MemoryAnswerStore, checkinScope } from "../store";

afterEach(cleanup);

const focus = WorkbookV3.parse(
  stripInternal(JSON.parse(readFileSync(resolve(__dirname, "../../../../content/workbooks/v3/focus.json"), "utf8"))),
);

/** A store with the two short check-in fields answered for one unit, so Save is enabled. */
function answeredCheckIn(unit: number): MemoryAnswerStore {
  const store = new MemoryAnswerStore();
  store.set(checkinScope(unit), "c_week", 6);
  store.set(checkinScope(unit), "c_win", "Planned two mornings");
  return store;
}

function saveButton(name: string | RegExp): HTMLButtonElement {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

describe("Player completion callbacks (F-020)", () => {
  it("fires onCheckInDone once per save with the unit number only", () => {
    const onCheckInDone = vi.fn();
    render(<Player workbook={focus} store={answeredCheckIn(3)} initialView={{ kind: "checkin", number: 3 }} onCheckInDone={onCheckInDone} />);
    fireEvent.click(screen.getByRole("button", { name: "Hard week, two questions" }));
    fireEvent.click(saveButton("Save check-in"));
    expect(onCheckInDone).toHaveBeenCalledTimes(1);
    expect(onCheckInDone).toHaveBeenCalledWith(3);
    // Save returns to the unit, so the button is gone and a stray second press cannot fire again.
    expect(screen.queryByRole("button", { name: "Save check-in" })).toBeNull();
  });

  it("keeps the check-in Save working without the callback", () => {
    render(<Player workbook={focus} store={answeredCheckIn(1)} initialView={{ kind: "checkin", number: 1 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Hard week, two questions" }));
    fireEvent.click(saveButton("Save check-in"));
    expect(screen.queryByRole("button", { name: "Save check-in" })).toBeNull();
  });

  it("fires onDailyCheckDone once per save and never passes the score or tags", () => {
    const onDailyCheckDone = vi.fn();
    render(<Player workbook={focus} store={new MemoryAnswerStore()} initialView={{ kind: "daily" }} onDailyCheckDone={onDailyCheckDone} />);
    expect(saveButton("Save").disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "7 out of 10" }));
    fireEvent.click(screen.getByRole("button", { name: "Slept well" }));
    fireEvent.click(saveButton("Save"));
    expect(onDailyCheckDone).toHaveBeenCalledTimes(1);
    expect(onDailyCheckDone.mock.calls[0]).toEqual([]);
    expect(screen.getByRole("status").textContent).toBe("Saved.");

    // The value clears, so Save is disabled until the reader answers again.
    expect(saveButton("Save").disabled).toBe(true);
    fireEvent.click(saveButton("Save"));
    expect(onDailyCheckDone).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "4 out of 10" }));
    fireEvent.click(saveButton("Save"));
    expect(onDailyCheckDone).toHaveBeenCalledTimes(2);
  });

  it("shows no daily Save button when no callback is given, as before", () => {
    render(<Player workbook={focus} store={new MemoryAnswerStore()} initialView={{ kind: "daily" }} />);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
});
