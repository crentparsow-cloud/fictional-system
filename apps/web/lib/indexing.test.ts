import { describe, expect, it } from "vitest";
import { indexingOn, publicRobots } from "./indexing";

describe("search indexing switch", () => {
  it("is off while blank or anything but on", () => {
    expect(indexingOn({})).toBe(false);
    expect(indexingOn({ SEARCH_INDEXING: "" })).toBe(false);
    expect(indexingOn({ SEARCH_INDEXING: "yes" })).toBe(false);
    expect(indexingOn({ SEARCH_INDEXING: " On " })).toBe(true);
  });

  it("indexes a public page only when on, and never a demo page", () => {
    expect(publicRobots({}, {})).toEqual({ index: false, follow: false });
    expect(publicRobots({}, { SEARCH_INDEXING: "on" })).toEqual({ index: true, follow: true });
    expect(publicRobots({ isDemo: true }, { SEARCH_INDEXING: "on" })).toEqual({ index: false, follow: false });
  });
});
