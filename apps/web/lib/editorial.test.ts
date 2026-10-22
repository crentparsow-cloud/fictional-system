import { describe, expect, it } from "vitest";
import type { LibraryCard } from "./catalogue-types";
import { pickActiveSlot, resolveSlot, slotDates, type EditorialSlotRow } from "./editorial";

const NOW = new Date("2026-10-21T10:00:00Z");
const row = (o: Partial<EditorialSlotRow>): EditorialSlotRow => ({
  id: "a",
  heading: "This week",
  line: "",
  workbookId: "w1",
  themeId: null,
  startsOn: "2026-10-19",
  endsOn: "2026-10-25",
  status: "live",
  ...o,
});
const card = { id: "w1", slug: "one", title: "One" } as LibraryCard;

describe("editorial slot (7.10)", () => {
  it("picks a live slot inside its dates", () => {
    expect(pickActiveSlot([row({})], NOW)?.id).toBe("a");
  });

  it("ignores drafts and slots outside their dates", () => {
    expect(pickActiveSlot([row({ status: "draft" })], NOW)).toBeNull();
    expect(pickActiveSlot([row({ startsOn: "2026-10-22", endsOn: "2026-10-28" })], NOW)).toBeNull();
    expect(pickActiveSlot([row({ startsOn: "2026-10-01", endsOn: "2026-10-20" })], NOW)).toBeNull();
  });

  it("takes the latest start when two overlap, then the latest id", () => {
    const rows = [row({ id: "a", startsOn: "2026-10-18" }), row({ id: "b", startsOn: "2026-10-20" }), row({ id: "c", startsOn: "2026-10-20" })];
    expect(pickActiveSlot(rows, NOW)?.id).toBe("c");
  });

  it("says its dates in words", () => {
    expect(slotDates("2026-10-19", "2026-10-25", NOW)).toBe("19 to 25 October");
    expect(slotDates("2026-10-28", "2026-11-03", NOW)).toBe("28 October to 3 November");
    expect(slotDates("2026-10-21", "2026-10-21", NOW)).toBe("21 October");
    expect(slotDates("2026-12-28", "2027-01-03", NOW)).toBe("28 December 2026 to 3 January 2027");
    expect(slotDates("nope", "2026-10-25", NOW)).toBe("");
  });

  it("resolves to a visible title, or a shown Theme, or nothing", () => {
    expect(resolveSlot(row({}), [card], [], NOW)).toMatchObject({ kind: "workbook", dates: "19 to 25 October" });
    expect(resolveSlot(row({ workbookId: "gone" }), [card], [], NOW)).toBeNull();
    expect(resolveSlot(row({ workbookId: null, themeId: "t1" }), [], [{ id: "t1", name: "Money" }], NOW)).toMatchObject({ kind: "theme", theme: { id: "t1" } });
    expect(resolveSlot(row({ workbookId: null, themeId: "t2" }), [], [{ id: "t1", name: "Money" }], NOW)).toBeNull();
    expect(resolveSlot(null, [card], [], NOW)).toBeNull();
  });
});
