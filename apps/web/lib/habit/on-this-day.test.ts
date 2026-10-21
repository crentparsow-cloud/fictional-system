import { describe, expect, it } from "vitest";
import { anniversaryDays, labelFor, monthsBefore, orderCandidates } from "./on-this-day";

describe("monthsBefore", () => {
  it("keeps the day of the month", () => {
    expect(monthsBefore("2026-10-21", 1)).toBe("2026-09-21");
    expect(monthsBefore("2026-10-21", 12)).toBe("2025-10-21");
    expect(monthsBefore("2026-01-15", 3)).toBe("2025-10-15");
  });

  it("clamps to the end of a shorter month", () => {
    expect(monthsBefore("2026-03-31", 1)).toBe("2026-02-28");
    expect(monthsBefore("2028-03-31", 1)).toBe("2028-02-29");
    expect(monthsBefore("2026-10-31", 6)).toBe("2026-04-30");
  });

  it("handles a leap day a year later", () => {
    expect(monthsBefore("2029-02-28", 12)).toBe("2028-02-28");
    expect(monthsBefore("2028-02-29", 12)).toBe("2027-02-28");
  });
});

describe("anniversaryDays", () => {
  it("lists one day per anniversary with a plain label", () => {
    const days = anniversaryDays("2026-10-21");
    expect(days.map((d) => d.date)).toEqual(["2026-09-21", "2026-07-21", "2026-04-21", "2025-10-21", "2024-10-21"]);
    expect(days[0]!.label).toBe("A month ago");
    expect(labelFor("2025-10-21", days)).toBe("A year ago");
    expect(labelFor("2025-10-22", days)).toBeNull();
  });
});

describe("orderCandidates", () => {
  const items = [
    { id: "c", date: "2026-09-21" },
    { id: "a", date: "2025-10-21" },
    { id: "b", date: "2025-10-21" },
  ];
  it("puts the oldest day first and is stable for a seed", () => {
    const one = orderCandidates(items, "u|2026-10-21");
    expect(one[0]!.date).toBe("2025-10-21");
    expect(one[2]!.id).toBe("c");
    expect(orderCandidates(items, "u|2026-10-21")).toEqual(one);
  });
  it("returns every item once and handles none", () => {
    expect(orderCandidates(items, "x").map((i) => i.id).sort()).toEqual(["a", "b", "c"]);
    expect(orderCandidates([], "x")).toEqual([]);
  });
});
