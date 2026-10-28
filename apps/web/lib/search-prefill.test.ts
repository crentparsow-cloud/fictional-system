import { describe, expect, it } from "vitest";
import { initialQueryFromSearch } from "./search";

describe("initialQueryFromSearch", () => {
  it("reads q from the address", () => {
    expect(initialQueryFromSearch("?q=wealth")).toBe("wealth");
    expect(initialQueryFromSearch("?q=money%20worries&x=1")).toBe("money worries");
  });
  it("gives an empty string when there is no query", () => {
    expect(initialQueryFromSearch("")).toBe("");
    expect(initialQueryFromSearch(null)).toBe("");
    expect(initialQueryFromSearch("?x=1")).toBe("");
    expect(initialQueryFromSearch("?q=")).toBe("");
  });
  it("trims and caps the length", () => {
    expect(initialQueryFromSearch("?q=%20%20hello%20")).toBe("hello");
    expect(initialQueryFromSearch(`?q=${"a".repeat(300)}`)).toHaveLength(200);
  });
});
