import { describe, expect, it } from "vitest";
import { deletionState, isDeleteConfirmed, longDate, noticeText } from "./account";

const now = new Date("2026-10-07T12:00:00Z");
const row = (over: Partial<{ requested_at: string; cancel_before: string; cancelled_at: string | null; completed_at: string | null }> = {}) => ({
  requested_at: "2026-10-05T12:00:00Z",
  cancel_before: "2026-10-12T12:00:00Z",
  cancelled_at: null,
  completed_at: null,
  ...over,
});

describe("deletion state shown on the You tab", () => {
  it("is none with no request", () => {
    expect(deletionState(null, now)).toEqual({ kind: "none" });
    expect(deletionState(undefined, now)).toEqual({ kind: "none" });
  });
  it("is pending inside the 7 days, with the deletion date", () => {
    expect(deletionState(row(), now)).toEqual({ kind: "pending", requestedAt: "2026-10-05T12:00:00Z", deletesOn: "2026-10-12T12:00:00Z" });
  });
  it("is due once the window has passed but the job has not run", () => {
    expect(deletionState(row({ cancel_before: "2026-10-07T11:59:59Z" }), now)).toEqual({ kind: "due", deletesOn: "2026-10-07T11:59:59Z" });
    expect(deletionState(row({ cancel_before: now.toISOString() }), now).kind).toBe("due");
  });
  it("goes back to none after a cancel, so the reader can ask again", () => {
    expect(deletionState(row({ cancelled_at: "2026-10-06T09:00:00Z" }), now)).toEqual({ kind: "none" });
  });
  it("is completed once the job has run", () => {
    expect(deletionState(row({ completed_at: "2026-10-12T13:00:00Z" }), now)).toEqual({ kind: "completed", completedAt: "2026-10-12T13:00:00Z" });
  });
  it("treats a broken date as no request rather than guessing", () => {
    expect(deletionState(row({ cancel_before: "soon" }), now)).toEqual({ kind: "none" });
  });
});

describe("helpers", () => {
  it("writes dates in UK time", () => {
    expect(longDate("2026-10-12T12:00:00Z")).toBe("12 October 2026");
    expect(longDate("2026-10-12T23:30:00Z")).toBe("13 October 2026");
    expect(longDate("nope")).toBe("");
  });
  it("accepts DELETE in any case and nothing else", () => {
    expect(isDeleteConfirmed(" delete ")).toBe(true);
    expect(isDeleteConfirmed("DELETE")).toBe(true);
    expect(isDeleteConfirmed("del")).toBe(false);
    expect(isDeleteConfirmed(null)).toBe(false);
  });
  it("shows only known notices", () => {
    expect(noticeText("deletion-cancelled")).toBe("Deletion cancelled. Your account is back to normal.");
    expect(noticeText(["deletion-confirm"])).toBe("Please type DELETE to confirm.");
    expect(noticeText("<b>hi</b>")).toBeNull();
    expect(noticeText(undefined)).toBeNull();
  });
});
