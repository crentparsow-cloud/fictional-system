import { describe, expect, it } from "vitest";
import { firstUnitFreeLabel } from "@/lib/free-label";
import { trialLabel } from "@/lib/membership-trial";

describe("free first unit label (5.3)", () => {
  it("reads 'Week 1 is free, no card' for a weekly programme", () => {
    expect(firstUnitFreeLabel({ hasVersion: true, unit: "week", freeUnits: 1 })).toBe("Week 1 is free, no card");
  });

  it("follows the unit word of the workbook", () => {
    expect(firstUnitFreeLabel({ hasVersion: true, unit: "day" })).toBe("Day 1 is free, no card");
    expect(firstUnitFreeLabel({ hasVersion: true, unit: "module" })).toBe("Module 1 is free, no card");
    expect(firstUnitFreeLabel({ hasVersion: true, unit: "chapter" })).toBe("Chapter 1 is free, no card");
    expect(firstUnitFreeLabel({ hasVersion: true })).toBe("Unit 1 is free, no card");
  });

  it("says so when more than one unit is free", () => {
    expect(firstUnitFreeLabel({ hasVersion: true, unit: "week", freeUnits: 2 })).toBe("Weeks 1 and 2 are free, no card");
    expect(firstUnitFreeLabel({ hasVersion: true, unit: "week", freeUnits: 3 })).toBe("Weeks 1 to 3 are free, no card");
  });

  it("is absent when there is no published first unit or nothing free", () => {
    expect(firstUnitFreeLabel({ hasVersion: false, unit: "week" })).toBeNull();
    expect(firstUnitFreeLabel({ hasVersion: true, unit: "week", freeUnits: 0 })).toBeNull();
  });

  it("is kept apart from the trial label, which never says free", () => {
    expect(trialLabel("monthly", 14, "£7.99")).not.toMatch(/free/i);
    expect(firstUnitFreeLabel({ hasVersion: true, unit: "week" })).not.toMatch(/trial/i);
  });
});
