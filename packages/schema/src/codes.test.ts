import { describe, expect, it } from "vitest";
import { isCode, mintCode } from "./codes";

describe("mintCode", () => {
  it("produces a prefixed five character Crockford code", () => {
    const code = mintCode("AK", "focus");
    expect(code).toMatch(/^AK-[0-9A-HJKMNP-TV-Z]{5}$/);
    expect(isCode(code, "AK")).toBe(true);
    expect(isCode(code, "AU")).toBe(false);
  });

  it("is deterministic and changes with n", () => {
    expect(mintCode("AK", "focus")).toBe(mintCode("AK", "focus"));
    expect(mintCode("AK", "focus", 1)).not.toBe(mintCode("AK", "focus", 0));
  });

  it("accepts the codes already minted in the demo catalogue", () => {
    // The planning conference minted these with its own key. We could not
    // reproduce them from the slug, title or author, so they are carried as given.
    expect(isCode("AK-TJWHK", "AK")).toBe(true);
    expect(isCode("AU-9ZG4W", "AU")).toBe(true);
    expect(isCode("PB-7JEW0", "PB")).toBe(true);
    // Crockford base32 has no I, L, O or U.
    expect(isCode("AK-TJWHI")).toBe(false);
  });
});
