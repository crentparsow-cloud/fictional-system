import { describe, expect, it } from "vitest";
import { AdviceGuardrailInput, Field, ProgrammeUnit, SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS } from "./v3";

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
