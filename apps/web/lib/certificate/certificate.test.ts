import { describe, expect, it } from "vitest";
import { certificateNotice, certificateUrl, certificateWords, cleanHolderName } from "@/lib/certificate/certificate";

describe("cleanHolderName", () => {
  it("trims, collapses spaces and treats blank as no name", () => {
    expect(cleanHolderName("  Sam   Reader ")).toEqual({ ok: true, name: "Sam Reader" });
    expect(cleanHolderName("   ")).toEqual({ ok: true, name: null });
    expect(cleanHolderName(null)).toEqual({ ok: true, name: null });
  });
  it("refuses long names, markup and non-text", () => {
    expect(cleanHolderName("x".repeat(61)).ok).toBe(false);
    expect(cleanHolderName("<b>Sam</b>").ok).toBe(false);
    expect(cleanHolderName("Sam\u0000").ok).toBe(false);
    expect(cleanHolderName(5).ok).toBe(false);
    expect(cleanHolderName("x".repeat(60)).ok).toBe(true);
  });
});

describe("certificateWords", () => {
  it("has no date or score in it", () => {
    const w = certificateWords("Plan Your Week", "Sam");
    expect(w.line).toBe("Sam finished");
    expect(w.title).toBe("Plan Your Week");
    expect(JSON.stringify(w)).not.toMatch(/\b(19|20)\d\d\b|\d+%|score|streak/i);
  });
  it("copes with no name", () => {
    expect(certificateWords("T", null).line).toBe("Finished");
  });
});

describe("notices and urls", () => {
  it("knows its notices only", () => {
    expect(certificateNotice("saved")).toBe("Saved.");
    expect(certificateNotice("<script>")).toBeNull();
    expect(certificateNotice(undefined)).toBeNull();
  });
  it("joins the origin and token", () => {
    expect(certificateUrl("https://akana.test/", "abc")).toBe("https://akana.test/c/abc");
  });
});
