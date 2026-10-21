import { describe, expect, it } from "vitest";
import type { LibraryCard } from "@/lib/catalogue-types";
import { categoryChips } from "./categories";

const card = (id: string, themeId: string | null) => ({ id, themeId }) as unknown as LibraryCard;
const theme = (id: string, name: string, shelfId: string | null, shelfName: string | null, retired = false) => ({ id, name, line: null, shelfId, shelfName, retired });

describe("categoryChips", () => {
  const themes = [theme("sleep", "Sleep", "health-and-body", "Health and Body"), theme("budget", "Budgeting", "money", "Money"), theme("old", "Old", "money", "Money", true), theme("empty", "Empty", "money", "Money"), theme("loose", "Loose", null, null)];
  const cards = [card("1", "sleep"), card("2", "budget"), card("3", "old"), card("4", "loose")];

  it("makes one chip per live Theme, linking to its Theme page", () => {
    const chips = categoryChips(themes, cards);
    expect(chips.map((c) => [c.name, c.href, c.shelfId])).toEqual([
      ["Sleep", "/themes/sleep", "health-and-body"],
      ["Budgeting", "/themes/budget", "money"],
      ["Loose", "/themes/loose", null],
    ]);
  });
  it("leaves out retired and empty Themes", () => {
    const ids = categoryChips(themes, cards).map((c) => c.id);
    expect(ids).not.toContain("old");
    expect(ids).not.toContain("empty");
  });
  it("is empty when there is nothing to list", () => {
    expect(categoryChips([], [])).toEqual([]);
  });
});
