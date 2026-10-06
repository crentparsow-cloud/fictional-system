import { newKeySpec } from "@akana/seal";
import { describe, expect, it } from "vitest";
import { loadKeyRing, sealValue, unsealValue } from "./sealing";

const scope = { userId: "55555555-5555-5555-5555-555555555555", tenantId: "00000000-0000-0000-0000-00000000000a", field: "exercise:ex_one.f_one" };

describe("sealing helpers", () => {
  it("round trips a value for the same user, tenant and field", async () => {
    const ring = loadKeyRing({ ANSWERS_KEYS: newKeySpec("k1") });
    const { sealed, keyId } = await sealValue(ring, scope, { note: "quiet", items: [1, 2] });
    expect(keyId).toBe("k1");
    expect(sealed.startsWith("v2.k1.")).toBe(true);
    expect(sealed).not.toContain("quiet");
    await expect(unsealValue(ring, scope, sealed)).resolves.toEqual({ note: "quiet", items: [1, 2] });
  });

  it("will not open for another user", async () => {
    const ring = loadKeyRing({ ANSWERS_KEYS: newKeySpec("k1") });
    const { sealed } = await sealValue(ring, scope, "mine");
    await expect(unsealValue(ring, { ...scope, userId: "66666666-6666-6666-6666-666666666666" }, sealed)).rejects.toThrow();
  });

  it("will not open on another tenant", async () => {
    const ring = loadKeyRing({ ANSWERS_KEYS: newKeySpec("k1") });
    const { sealed } = await sealValue(ring, scope, "mine");
    await expect(unsealValue(ring, { ...scope, tenantId: "11111111-1111-1111-1111-111111111111" }, sealed)).rejects.toThrow();
  });

  it("will not open for another field", async () => {
    const ring = loadKeyRing({ ANSWERS_KEYS: newKeySpec("k1") });
    const { sealed } = await sealValue(ring, scope, "mine");
    await expect(unsealValue(ring, { ...scope, field: "exercise:ex_two.f_one" }, sealed)).rejects.toThrow();
  });

  it("names the key script when ANSWERS_KEYS is missing", () => {
    expect(() => loadKeyRing({})).toThrow(/scripts\/new-seal-key\.ts/);
    expect(() => loadKeyRing({ ANSWERS_KEYS: "  " })).toThrow(/ANSWERS_KEYS/);
  });
});
