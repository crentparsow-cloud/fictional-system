import { describe, expect, it } from "vitest";
import { whoIsItFor } from "./who-for";

describe("whoIsItFor", () => {
  it("always gives three lines", () => {
    expect(whoIsItFor({ cardLine: "A calm start.", genre: "Self help" })).toHaveLength(3);
  });
  it("uses the catalogue fields first", () => {
    const lines = whoIsItFor({ tagline: "For tired evenings.", cardLine: "x", howItWorks: ["One short step a day.", "Write as little as you like."], genre: "Self help", minutes: 10 });
    expect(lines).toEqual(["For tired evenings.", "One short step a day.", "Write as little as you like."]);
  });
  it("falls back without inventing anything", () => {
    expect(whoIsItFor({ cardLine: "A calm start.", genre: "Self help", theme: "Sleep", minutes: 8 })).toEqual([
      "A calm start.",
      "A self help workbook on sleep.",
      "Set aside about 8 minutes a day, and go at your own pace.",
    ]);
  });
});
