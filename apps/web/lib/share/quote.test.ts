import { describe, expect, it } from "vitest";
import { cleanLine, isQuotable, quotableLines, quoteImagePath, sentences, signQuote, verifyQuote } from "@/lib/share/quote";

const LINE = "Small steps taken most days beat big plans you meant to start.";

describe("quotable lines", () => {
  it("accepts a plain sentence and refuses short, long, linked and unsupported text", () => {
    expect(isQuotable(LINE)).toBe(true);
    expect(isQuotable("Too short.")).toBe(false);
    expect(isQuotable("a".repeat(201))).toBe(false);
    expect(isQuotable("Read more at https://example.com for the full story today.")).toBe(false);
    expect(isQuotable("Noch ein Satz mit Zeichen außerhalb des Fonts: 漢字漢字漢字漢字漢字.")).toBe(false);
    expect(isQuotable(`A line with curly ${String.fromCharCode(0x2018)}quotes${String.fromCharCode(0x2019)} and a dash ${String.fromCharCode(0x2014)} is fine here.`)).toBe(true);
  });
  it("splits sentences and tidies spaces", () => {
    expect(sentences("One thing first.  Then another thing!\nA third?")).toEqual(["One thing first.", "Then another thing!", "A third?"]);
    expect(cleanLine("  a \n b  ")).toBe("a b");
  });
  it("collects from the intro, ideas and takeaway without repeats, up to the cap", () => {
    const unit = {
      intro: `${LINE} ${LINE} Start with the smallest step you can name today.`,
      ideas: [{ heading: "h", body: "Write the first line before you decide anything else about it.", example: "e" }, "junk", null],
      takeaway: "Come back tomorrow and do the next small thing again, gently.",
    };
    const lines = quotableLines(unit);
    expect(lines).toHaveLength(4);
    expect(new Set(lines).size).toBe(4);
    expect(quotableLines(unit, 2)).toHaveLength(2);
    expect(quotableLines({})).toEqual([]);
  });
});

describe("signing", () => {
  const secret = "test-secret-not-real";
  it("verifies the exact workbook and line only", () => {
    const sig = signQuote(secret, "plan-your-week", LINE)!;
    expect(sig).toMatch(/^[0-9a-f]{32}$/);
    expect(verifyQuote(secret, "plan-your-week", LINE, sig)).toBe(true);
    expect(verifyQuote(secret, "other-book", LINE, sig)).toBe(false);
    expect(verifyQuote(secret, "plan-your-week", LINE + " More.", sig)).toBe(false);
    expect(verifyQuote("another-secret", "plan-your-week", LINE, sig)).toBe(false);
    expect(verifyQuote(secret, "plan-your-week", LINE, "zz")).toBe(false);
  });
  it("refuses to sign without a secret or for unsuitable text", () => {
    expect(signQuote("", "plan-your-week", LINE)).toBeNull();
    expect(signQuote(secret, "Bad Slug", LINE)).toBeNull();
    expect(signQuote(secret, "plan-your-week", "short")).toBeNull();
    expect(verifyQuote("", "plan-your-week", LINE, "0".repeat(32))).toBe(false);
  });
  it("builds an address carrying the three parts", () => {
    const p = quoteImagePath("plan-your-week", LINE, "a".repeat(32));
    const q = new URL(p, "https://x.example").searchParams;
    expect(q.get("w")).toBe("plan-your-week");
    expect(q.get("l")).toBe(LINE);
    expect(q.get("s")).toBe("a".repeat(32));
  });
});
