import { describe, expect, it } from "vitest";
import { canonicalJson, contentHash } from "./hash";

describe("canonicalJson and contentHash", () => {
  it("sorts keys at every level and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: [{ z: 1, y: 2 }], c: undefined } })).toBe('{"a":{"d":[{"y":2,"z":1}]},"b":1}');
  });

  it("gives the same hash whatever the key order", () => {
    expect(contentHash({ a: 1, b: [1, 2] })).toBe(contentHash({ b: [1, 2], a: 1 }));
    expect(contentHash({ a: 1, b: [2, 1] })).not.toBe(contentHash({ a: 1, b: [1, 2] }));
  });

  it("is pinned to a known value", () => {
    // sha256 of the string {"a":1}. If this fails, every stored hash is invalid.
    expect(contentHash({ a: 1 })).toBe("015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862");
  });
});
