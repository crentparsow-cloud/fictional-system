import { describe, expect, it } from "vitest";
import { bytesToBase64Url, pushSupport, urlBase64ToBytes } from "@/lib/push/client";

describe("base64url", () => {
  it("round-trips bytes", () => {
    const bytes = Uint8Array.from([4, 250, 251, 252, 0, 1, 62, 63, 255]);
    const text = bytesToBase64Url(bytes.buffer);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Array.from(urlBase64ToBytes(text))).toEqual(Array.from(bytes));
  });
  it("copes with no key", () => {
    expect(bytesToBase64Url(null)).toBe("");
  });
});

describe("pushSupport", () => {
  const base = { hasServiceWorker: true, hasPush: true, hasNotification: true, installed: true, isApple: false };
  it("is ready where everything is there", () => {
    expect(pushSupport(base)).toBe("ready");
  });
  it("is unsupported without the Push API", () => {
    expect(pushSupport({ ...base, hasPush: false })).toBe("unsupported");
    expect(pushSupport({ ...base, hasServiceWorker: false })).toBe("unsupported");
  });
  it("asks Apple devices to install first", () => {
    expect(pushSupport({ ...base, isApple: true, installed: false, hasPush: false, hasNotification: false })).toBe("needs_install");
    expect(pushSupport({ ...base, isApple: true, installed: false })).toBe("needs_install");
    expect(pushSupport({ ...base, isApple: true, installed: true })).toBe("ready");
  });
});
