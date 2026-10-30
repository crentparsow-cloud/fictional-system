import { describe, expect, it } from "vitest";
import { UNIT_WORDS } from "./catalogue-guard";
import { firstUnitFreeLabel } from "./free-label";
import { rhythmLine, unitWordLabel } from "./today/week";
import { WorkbookV3 } from "@akana/schema";

/** structure.unit "part" (decided 30 October 2026): labelled "Part" wherever a unit word shows. */
describe("the part unit", () => {
  it("is a valid structure unit", () => {
    expect(WorkbookV3.shape.structure.shape.unit.options).toContain("part");
  });

  it("is labelled Part in the catalogue, the free label and Today", () => {
    expect(UNIT_WORDS.part).toBe("Part");
    expect(firstUnitFreeLabel({ hasVersion: true, unit: "part" })).toBe("Part 1 is free, no card");
    expect(unitWordLabel("part")).toBe("Part");
    expect(rhythmLine({ unitWord: "part", unit: 2, unitCount: 6, stepsInUnit: 1 })).toBe("Part 2 of 6. One step in this part.");
  });
});
