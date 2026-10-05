import { describe, expect, it } from "vitest";
import { KeyRing, newKeySpec } from "./index";

const scope = { userId: "u1", tenantId: "akana", field: "exercise:first_step.what" };

describe("KeyRing", () => {
  it("round trips a value", async () => {
    const ring = KeyRing.fromEnv({ ANSWERS_KEYS: newKeySpec("k1") });
    const sealed = await ring.seal({ text: "a quiet morning" }, scope);
    expect(sealed.value.startsWith("v2.k1.")).toBe(true);
    expect(await ring.unseal(sealed.value, scope)).toEqual({ text: "a quiet morning" });
  });

  it("refuses a value moved to another user, tenant or field", async () => {
    const ring = KeyRing.fromEnv({ ANSWERS_KEYS: newKeySpec("k1") });
    const sealed = await ring.seal("x", scope);
    await expect(ring.unseal(sealed.value, { ...scope, userId: "u2" })).rejects.toThrow();
    await expect(ring.unseal(sealed.value, { ...scope, tenantId: "other" })).rejects.toThrow();
    await expect(ring.unseal(sealed.value, { ...scope, field: "exercise:other" })).rejects.toThrow();
  });

  it("refuses a tampered ciphertext", async () => {
    const ring = KeyRing.fromEnv({ ANSWERS_KEYS: newKeySpec("k1") });
    const sealed = await ring.seal("x", scope);
    const parts = sealed.value.split(".");
    const buf = Buffer.from(parts[2]!, "base64");
    buf[buf.length - 1] = buf[buf.length - 1]! ^ 1;
    const tampered = `${parts[0]}.${parts[1]}.${buf.toString("base64")}`;
    await expect(ring.unseal(tampered, scope)).rejects.toThrow();
  });

  it("reads with an older key and flags it for rotation", async () => {
    const k1 = newKeySpec("k1");
    const k2 = newKeySpec("k2");
    const old = KeyRing.fromEnv({ ANSWERS_KEYS: k1 });
    const sealed = await old.seal(42, scope);
    const rotated = KeyRing.fromEnv({ ANSWERS_KEYS: `${k2},${k1}` });
    expect(rotated.activeKeyId).toBe("k2");
    expect(await rotated.unseal(sealed.value, scope)).toBe(42);
    expect(rotated.needsRotation(sealed.value)).toBe(true);
    const fresh = await rotated.seal(42, scope);
    expect(rotated.needsRotation(fresh.value)).toBe(false);
  });

  it("rejects bad configuration", () => {
    expect(() => KeyRing.fromEnv({ ANSWERS_KEYS: "" })).toThrow("seal_not_configured");
    expect(() => KeyRing.fromEnv({ ANSWERS_KEYS: "v2.k1.short" })).toThrow();
    expect(() => KeyRing.fromEnv({ ANSWERS_KEYS: `${newKeySpec("k1")},${newKeySpec("k1")}` })).toThrow("seal_duplicate_key_id");
  });
});
