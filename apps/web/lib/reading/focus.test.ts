import { describe, expect, it } from "vitest";
import { centresTyping, dimsParagraphs, isLongAnswer, nearestToCentre, toggleFocus, typewriterDelta } from "./focus";

describe("focus mode", () => {
  it("maps the choices to the two effects", () => {
    expect([dimsParagraphs("off"), dimsParagraphs("dim"), dimsParagraphs("typewriter"), dimsParagraphs("both")]).toEqual([false, true, false, true]);
    expect([centresTyping("off"), centresTyping("dim"), centresTyping("typewriter"), centresTyping("both")]).toEqual([false, false, true, true]);
  });
  it("picks the block nearest the middle of the screen", () => {
    const blocks = [
      { top: -300, bottom: -100 },
      { top: 100, bottom: 250 },
      { top: 380, bottom: 520 },
      { top: 800, bottom: 900 },
    ];
    expect(nearestToCentre(blocks, 800)).toBe(2);
  });
  it("ignores blocks off the screen, and returns -1 when none are on it", () => {
    expect(nearestToCentre([{ top: -200, bottom: -10 }, { top: 900, bottom: 1000 }], 800)).toBe(-1);
    expect(nearestToCentre([], 800)).toBe(-1);
  });
  it("moves the page only when the writing line has dropped below the middle", () => {
    expect(typewriterDelta(100, 24, 800)).toBe(0);
    expect(typewriterDelta(360, 24, 800)).toBe(0);
    expect(typewriterDelta(600, 24, 800)).toBe(252);
  });
  it("does not jitter inside the slack", () => {
    expect(typewriterDelta(360, 24, 800)).toBe(0);
  });
  it("treats an answer as long from four rows or a few hundred characters", () => {
    expect(isLongAnswer(2, 40)).toBe(false);
    expect(isLongAnswer(4, 0)).toBe(true);
    expect(isLongAnswer(2, 300)).toBe(true);
  });
  it("switches each half on and off without disturbing the other", () => {
    expect(toggleFocus("off", "dim")).toBe("dim");
    expect(toggleFocus("dim", "typewriter")).toBe("both");
    expect(toggleFocus("both", "dim")).toBe("typewriter");
    expect(toggleFocus("typewriter", "typewriter")).toBe("off");
    expect(toggleFocus("dim", "dim")).toBe("off");
  });
});
