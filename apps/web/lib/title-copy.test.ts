import { describe, expect, it } from "vitest";
import { firstNameOf, loadTitleCopy, titleCopyFor } from "./title-copy";

describe("title copy loader", () => {
  it("reads the sidecar and finds an entry by code", () => {
    const all = loadTitleCopy();
    expect(all.size).toBeGreaterThan(90);
    const [code] = [...all.keys()];
    expect(titleCopyFor(code)?.letters.length).toBeGreaterThanOrEqual(4);
  });
  it("gives nothing for an unknown or missing code", () => {
    expect(titleCopyFor("AK-00000")).toBeUndefined();
    expect(titleCopyFor(null)).toBeUndefined();
  });
  it("gives an empty map when the file is missing", () => {
    expect(loadTitleCopy("/nonexistent/title-copy.json").size).toBe(0);
  });
  it("takes the first word of a display name", () => {
    expect(firstNameOf("  Ada  Lovelace ")).toBe("Ada");
    expect(firstNameOf("")).toBeUndefined();
    expect(firstNameOf(null)).toBeUndefined();
  });
});
