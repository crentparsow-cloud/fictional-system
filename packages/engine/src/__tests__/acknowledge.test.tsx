import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WorkbookV3, stripInternal } from "@akana/schema";
import { Player } from "../Player";
import { MemoryAnswerStore } from "../store";

afterEach(cleanup);

const load = (name: string) =>
  WorkbookV3.parse(stripInternal(JSON.parse(readFileSync(resolve(__dirname, `../../../../content/workbooks/v3/${name}.json`), "utf8"))));
const higher = load("grief");

describe("Higher-tier acknowledgement (F-022)", () => {
  it("shows the higher tier note and holds the reader on Start until they acknowledge", () => {
    const onAcknowledge = vi.fn();
    render(
      <Player
        workbook={higher}
        store={new MemoryAnswerStore()}
        initialView={{ kind: "unit", number: 1 }}
        requireAcknowledge
        onAcknowledge={onAcknowledge}
      />,
    );
    expect(higher.safety_tier).toBe("higher");
    expect(higher.start.higher_tier_note).toBeTruthy();
    expect(screen.getByText(higher.start.higher_tier_note as string)).toBeTruthy();
    // No unit and no navigation while unacknowledged.
    expect(screen.queryByRole("navigation", { name: "Workbook" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "I have read this" }));
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("navigation", { name: "Workbook" })).toBeTruthy();
  });

  it("opens where asked once the app says the reader has acknowledged", () => {
    render(
      <Player workbook={higher} store={new MemoryAnswerStore()} initialView={{ kind: "toolkit" }} requireAcknowledge acknowledged />,
    );
    expect(screen.getByRole("navigation", { name: "Workbook" })).toBeTruthy();
  });

  it("does not gate when not asked to", () => {
    render(<Player workbook={higher} store={new MemoryAnswerStore()} initialView={{ kind: "toolkit" }} />);
    expect(screen.getByRole("navigation", { name: "Workbook" })).toBeTruthy();
  });
});
