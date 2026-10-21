import { describe, expect, it } from "vitest";
import { gapDue, gapKey, lastActivityAt, PICKUP_GAP_DAYS, reflectionField } from "@/lib/today/gap";

const now = new Date("2026-10-10T12:00:00Z");

describe("gap detection", () => {
  it("is 14 days", () => {
    expect(PICKUP_GAP_DAYS).toBe(14);
  });

  it("takes the latest of the last open and any event", () => {
    const last = lastActivityAt("2026-09-01T10:00:00Z", [{ at: "2026-09-20T10:00:00Z" }, { at: "2026-09-10T10:00:00Z" }]);
    expect(last?.toISOString()).toBe("2026-09-20T10:00:00.000Z");
  });

  it("ignores values that are not dates, and has nothing to say without any", () => {
    expect(lastActivityAt(null, [{ at: "nope" }])).toBeNull();
    expect(gapDue(null, now)).toBe(false);
  });

  it("is due at exactly 14 days and not before", () => {
    expect(gapDue(new Date("2026-09-26T12:00:00Z"), now)).toBe(true);
    expect(gapDue(new Date("2026-09-26T12:00:01Z"), now)).toBe(false);
    expect(gapDue(new Date("2026-10-01T12:00:00Z"), now)).toBe(false);
    expect(gapDue(new Date("2026-08-01T12:00:00Z"), now)).toBe(true);
  });

  it("takes the threshold as a setting", () => {
    expect(gapDue(new Date("2026-10-01T12:00:00Z"), now, 7)).toBe(true);
  });

  it("keys a skipped prompt and its reflection to the gap, by the date of the last activity", () => {
    const last = new Date("2026-09-20T10:00:00Z");
    expect(gapKey("e1", last)).toBe("akana.pickup.e1.2026-09-20");
    expect(reflectionField(last)).toBe("pickup:2026-09-20.reflection");
    expect(reflectionField(last)).toMatch(/^[a-z][a-z0-9_:~.-]{0,199}$/);
  });
});
