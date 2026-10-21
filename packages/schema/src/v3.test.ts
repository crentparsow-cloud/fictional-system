import { describe, expect, it } from "vitest";
import { AdviceGuardrailInput, AuthorLetter, Field, ProgrammeUnit, SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS, TitleCopy, WhoFor, WorkbookV3, withTitleCopy } from "./v3";

describe("advice_guardrail", () => {
  it("accepts the four canonical values unchanged", () => {
    for (const v of ["none", "not_legal_or_tax_advice", "not_medical_advice", "not_financial_advice"]) {
      expect(AdviceGuardrailInput.parse(v)).toBe(v);
    }
  });

  it("accepts the demo catalogue's money_guidance_not_advice as not_financial_advice", () => {
    expect(AdviceGuardrailInput.parse("money_guidance_not_advice")).toBe("not_financial_advice");
  });

  it("rejects anything else", () => {
    expect(AdviceGuardrailInput.safeParse("not_advice").success).toBe(false);
  });
});

describe("Field.sensitive (additive, 7 Oct 2026)", () => {
  const base = { id: "f_one", type: "long_text", label: "What happened?" };

  it("is optional, so fields without it still parse unchanged", () => {
    const parsed = Field.parse(base);
    expect(parsed).toEqual(base);
    expect("sensitive" in parsed).toBe(false);
  });

  it("accepts true and false", () => {
    expect(Field.parse({ ...base, sensitive: true }).sensitive).toBe(true);
    expect(Field.parse({ ...base, sensitive: false }).sensitive).toBe(false);
  });

  it("rejects anything that is not a boolean", () => {
    expect(Field.safeParse({ ...base, sensitive: "yes" }).success).toBe(false);
    expect(Field.safeParse({ ...base, sensitive: 1 }).success).toBe(false);
  });
});

describe("schema 3.1 unit parts (additive, 10 Oct 2026)", () => {
  const unit = { number: 1, focus: "Marcus begins by naming everyone who taught him", exercise_ids: ["a"] };

  it("accepts both 3.0 and 3.1 as the declared version, and nothing else", () => {
    expect(SUPPORTED_SCHEMA_VERSIONS).toEqual(["3.0", "3.1"]);
    expect(SCHEMA_VERSION).toBe("3.1");
  });

  it("keeps a unit without the new fields exactly as it was", () => {
    const parsed = ProgrammeUnit.parse(unit);
    expect(parsed).toEqual(unit);
    expect("intro" in parsed || "ideas" in parsed || "takeaway" in parsed).toBe(false);
  });

  it("accepts intro, ideas and takeaway", () => {
    const parsed = ProgrammeUnit.parse({ ...unit, intro: "Why.", ideas: [{ heading: "H", body: "B", example: "E" }], takeaway: "T." });
    expect(parsed.ideas).toHaveLength(1);
  });

  it("rejects more than ten ideas and an idea with a missing part", () => {
    const idea = { heading: "H", body: "B", example: "E" };
    expect(ProgrammeUnit.safeParse({ ...unit, ideas: Array(11).fill(idea) }).success).toBe(false);
    expect(ProgrammeUnit.safeParse({ ...unit, ideas: [{ heading: "H", body: "B" }] }).success).toBe(false);
    expect(ProgrammeUnit.safeParse({ ...unit, ideas: [{ ...idea, extra: 1 }] }).success).toBe(false);
  });
});

describe("schema 3.1 title copy and author letters (additive, 12 Oct 2026)", () => {
  const welcome = { id: "welcome", kind: "welcome", from: "author", demo: true, title: "A welcome", body: "{first_name}, welcome.", signed: "A. Author" };

  it("accepts a welcome letter with no unit and a unit letter with one", () => {
    expect(AuthorLetter.safeParse(welcome).success).toBe(true);
    expect(AuthorLetter.safeParse({ ...welcome, id: "w2", kind: "unit", at_unit: 2 }).success).toBe(true);
  });

  it("rejects a welcome letter with a unit and a unit letter without one", () => {
    expect(AuthorLetter.safeParse({ ...welcome, at_unit: 1 }).success).toBe(false);
    expect(AuthorLetter.safeParse({ ...welcome, kind: "unit" }).success).toBe(false);
  });

  it("rejects an unknown voice and unknown keys", () => {
    expect(AuthorLetter.safeParse({ ...welcome, from: "ghost" }).success).toBe(false);
    expect(AuthorLetter.safeParse({ ...welcome, extra: 1 }).success).toBe(false);
  });

  it("needs exactly three who-for lines", () => {
    expect(WhoFor.safeParse(["a", "b", "c"]).success).toBe(true);
    expect(WhoFor.safeParse(["a", "b"]).success).toBe(false);
  });

  it("parses a title copy entry with four or five letters", () => {
    const l = (n: number) => ({ ...welcome, id: `l${n}`, kind: "unit", at_unit: n });
    const entry = { code: "AK-TJWHK", card_line: "Keep a cash book.", end_state: "A cash book.", who_for: ["a", "b", "c"], letters: [welcome, l(2), l(3), l(4)] };
    expect(TitleCopy.safeParse(entry).success).toBe(true);
    expect(TitleCopy.safeParse({ ...entry, letters: [welcome] }).success).toBe(false);
  });

  it("leaves the new workbook fields optional", () => {
    const shape = WorkbookV3.shape;
    expect(shape.end_state.isOptional()).toBe(true);
    expect(shape.who_for.isOptional()).toBe(true);
    expect(shape.letters.isOptional()).toBe(true);
  });
});

describe("withTitleCopy", () => {
  const copy = TitleCopy.parse({
    code: "AK-TJWHK",
    card_line: "Keep a cash book.",
    end_state: "From the sidecar.",
    who_for: ["a", "b", "c"],
    letters: [1, 2, 3, 4].map((n) => ({ id: n === 1 ? "welcome" : `w${n}`, kind: n === 1 ? "welcome" : "unit", ...(n === 1 ? {} : { at_unit: n }), from: "author", demo: true, title: "T", body: "{first_name}, hello.", signed: "A" })),
  });

  it("fills missing fields from the sidecar", () => {
    const out = withTitleCopy({} as { end_state?: string; who_for?: string[]; letters?: unknown[] }, copy);
    expect(out.end_state).toBe("From the sidecar.");
    expect(out.letters).toHaveLength(4);
  });

  it("never overwrites a field the workbook already carries", () => {
    expect(withTitleCopy({ end_state: "Own words." }, copy).end_state).toBe("Own words.");
  });

  it("returns the document unchanged when there is no entry", () => {
    const doc = { end_state: "x" };
    expect(withTitleCopy(doc, undefined)).toBe(doc);
  });
});
