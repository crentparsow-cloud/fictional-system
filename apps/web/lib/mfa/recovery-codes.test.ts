import { describe, expect, it } from "vitest";
import { generateRecoveryCodes, hashRecoveryCode, normaliseRecoveryCode, RECOVERY_CODE_COUNT } from "@/lib/mfa/recovery-codes";

describe("reader recovery codes", () => {
  it("makes eight distinct codes of ten safe characters, shown in two halves", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
    for (const c of codes) {
      expect(c).toMatch(/^[A-HJ-KM-NP-Z2-9]{5}-[A-HJ-KM-NP-Z2-9]{5}$/);
      expect(c).not.toMatch(/[01OIL]/);
    }
  });
  it("forgives spaces, dashes and case when a code is typed back", () => {
    const [code] = generateRecoveryCodes(1);
    const raw = code!.replace("-", "");
    expect(normaliseRecoveryCode(code)).toBe(raw);
    expect(normaliseRecoveryCode(code!.toLowerCase())).toBe(raw);
    expect(normaliseRecoveryCode(` ${raw.slice(0, 3)} ${raw.slice(3)} `)).toBe(raw);
  });
  it("refuses what cannot be a code", () => {
    expect(normaliseRecoveryCode("")).toBeNull();
    expect(normaliseRecoveryCode("ABCDE-FGH")).toBeNull();
    expect(normaliseRecoveryCode("ABCDE-FGH10")).toBeNull();
    expect(normaliseRecoveryCode("ABCDE-FGHJK-M")).toBeNull();
    expect(normaliseRecoveryCode(42)).toBeNull();
    expect(normaliseRecoveryCode(null)).toBeNull();
  });
  it("hashes to 64 lower-case hex characters, the same every time", () => {
    const h = hashRecoveryCode("ABCDEFGHJK");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRecoveryCode("ABCDEFGHJK")).toBe(h);
    expect(hashRecoveryCode("ABCDEFGHJM")).not.toBe(h);
  });
});
