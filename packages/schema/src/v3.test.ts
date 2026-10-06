import { describe, expect, it } from "vitest";
import { AdviceGuardrailInput } from "./v3";

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
