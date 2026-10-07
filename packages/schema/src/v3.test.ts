import { describe, expect, it } from "vitest";
import { AdviceGuardrailInput, Field } from "./v3";

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
