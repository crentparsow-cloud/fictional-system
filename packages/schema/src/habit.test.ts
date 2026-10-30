import { describe, expect, it } from "vitest";
import { habitAllowed, MIND_AND_MOOD_SHELF_ID } from "./habit";

describe("habitAllowed", () => {
  it("keeps every Mind and Mood title out, whatever its tier", () => {
    for (const safetyTier of ["none", "standard", "higher"] as const) {
      expect(habitAllowed({ safetyTier, shelfId: MIND_AND_MOOD_SHELF_ID })).toBe(false);
    }
  });

  it("keeps the higher tier out on any shelf", () => {
    expect(habitAllowed({ safetyTier: "higher", shelfId: "health-and-body" })).toBe(false);
    expect(habitAllowed({ safetyTier: "higher", shelfId: null })).toBe(false);
  });

  it("allows other shelves, including standard tier titles off Mind and Mood", () => {
    expect(habitAllowed({ safetyTier: "none", shelfId: "money" })).toBe(true);
    expect(habitAllowed({ safetyTier: "standard", shelfId: "health-and-body" })).toBe(true);
    expect(habitAllowed({ safetyTier: "none", shelfId: null })).toBe(true);
  });
});
