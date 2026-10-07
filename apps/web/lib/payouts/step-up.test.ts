import { describe, expect, it } from "vitest";
import { hasRecentStepUp, totpAgeSeconds } from "@/lib/payouts/step-up";

const now = 1_800_000_000_000;
const sec = now / 1000;

describe("step-up", () => {
  it("passes with aal2 and a TOTP code in the last ten minutes", () => {
    expect(hasRecentStepUp({ aal: "aal2", amr: [{ method: "otp", timestamp: sec - 5000 }, { method: "totp", timestamp: sec - 30 }] }, now)).toBe(true);
  });
  it("fails when the code is old, the session is aal1 or there is no TOTP", () => {
    expect(hasRecentStepUp({ aal: "aal2", amr: [{ method: "totp", timestamp: sec - 601 }] }, now)).toBe(false);
    expect(hasRecentStepUp({ aal: "aal1", amr: [{ method: "totp", timestamp: sec - 1 }] }, now)).toBe(false);
    expect(hasRecentStepUp({ aal: "aal2", amr: [{ method: "password", timestamp: sec }] }, now)).toBe(false);
    expect(hasRecentStepUp(null, now)).toBe(false);
    expect(hasRecentStepUp({ aal: "aal2", amr: "totp" }, now)).toBe(false);
  });
  it("takes the latest TOTP time", () => {
    expect(totpAgeSeconds({ amr: [{ method: "totp", timestamp: sec - 900 }, { method: "totp", timestamp: sec - 60 }] }, now)).toBe(60);
    expect(totpAgeSeconds({ amr: [] }, now)).toBeNull();
  });
});
