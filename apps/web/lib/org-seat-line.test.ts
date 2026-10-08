import { describe, expect, it } from "vitest";
import { joinNames, liveOrganisationNames } from "./org-seat-line";

describe("Your organisation on Home", () => {
  it("shows live seats only, once each, by display name", () => {
    expect(liveOrganisationNames(null)).toEqual([]);
    expect(
      liveOrganisationNames([
        { organisation_name: "St Mary's", live: true },
        { organisation_name: "Acme Ltd", live: false },
        { organisation_name: "St Mary's", live: true },
        { organisation_name: "  ", live: true },
        { organisation_name: "Bright Charity", live: true },
      ]),
    ).toEqual(["Bright Charity", "St Mary's"]);
  });
  it("joins names in plain words", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["A"])).toBe("A");
    expect(joinNames(["A", "B"])).toBe("A and B");
    expect(joinNames(["A", "B", "C"])).toBe("A, B and C");
  });
});
