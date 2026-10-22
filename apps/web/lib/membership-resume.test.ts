import { describe, expect, it, vi } from "vitest";
import { resumeParams, runResume, type ResumeSubject } from "./membership-resume";

const NOW = new Date("2026-11-20T09:00:00Z");
const sub = (over: Partial<ResumeSubject> = {}): ResumeSubject => ({
  stripeSubscriptionId: "sub_abc",
  status: "active",
  pausedFrom: "2026-11-06T09:00:00Z",
  pausedUntil: "2026-12-06T09:00:00Z",
  ...over,
});
const api = () => ({ update: vi.fn().mockResolvedValue({}), cancel: vi.fn().mockResolvedValue({}) });

describe("resume a pause", () => {
  it("takes a running pause off and bills from today", async () => {
    const s = api();
    expect(await runResume(sub(), NOW, s)).toBe("resumed");
    expect(s.update).toHaveBeenCalledWith("sub_abc", {
      pause_collection: "",
      metadata: { pause_from: "", pause_until: "" },
      billing_cycle_anchor: "now",
      proration_behavior: "none",
    });
  });
  it("takes a pause that has not started off and leaves the billing date alone", async () => {
    const s = api();
    expect(await runResume(sub({ pausedFrom: "2026-12-01T09:00:00Z", pausedUntil: "2027-01-01T09:00:00Z" }), NOW, s)).toBe("resumed");
    const params = s.update.mock.calls[0]![1] as Record<string, unknown>;
    expect(params.billing_cycle_anchor).toBeUndefined();
    expect(params.pause_collection).toBe("");
  });
  it("does nothing when there is no pause or it has ended", async () => {
    const s = api();
    expect(await runResume(sub({ pausedFrom: null, pausedUntil: null }), NOW, s)).toBe("ineligible");
    expect(await runResume(sub({ pausedUntil: "2026-11-10T09:00:00Z" }), NOW, s)).toBe("ineligible");
    expect(await runResume(null, NOW, s)).toBe("ineligible");
    expect(await runResume(sub({ status: "canceled" }), NOW, s)).toBe("ineligible");
    expect(s.update).not.toHaveBeenCalled();
  });
  it("gives no params for no pause", () => {
    expect(resumeParams({ kind: "none" })).toBeNull();
  });
});
