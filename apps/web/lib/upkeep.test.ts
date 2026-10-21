import { describe, expect, it, vi } from "vitest";
import { runUpkeep, type StudentDueRow, type UndeliveredGift, type UpkeepDeps } from "./upkeep";

const gift = (id: string): UndeliveredGift => ({ id, months: 3, recipientEmail: "a@gift.test", recipientName: null, senderName: null, message: null, token: "t".repeat(40), claimBy: null });
const stu = (userId: string, due: "recheck" | "expired"): StudentDueRow => ({ userId, email: "s@uni.ac.uk", expiresAt: "2027-01-01T00:00:00Z", due });

function deps(over: Partial<UpkeepDeps> = {}): UpkeepDeps {
  return {
    studentOn: true,
    percent: 50,
    refreshProof: vi.fn().mockResolvedValue(4),
    expireGifts: vi.fn().mockResolvedValue({ ended: 2, unclaimed: 1 }),
    undeliveredGifts: vi.fn().mockResolvedValue([]),
    sendGift: vi.fn().mockResolvedValue(true),
    markGiftDelivered: vi.fn().mockResolvedValue(undefined),
    studentDue: vi.fn().mockResolvedValue([]),
    sendRecheck: vi.fn().mockResolvedValue(true),
    removeDiscount: vi.fn().mockResolvedValue(undefined),
    sendEnded: vi.fn().mockResolvedValue(true),
    markStudent: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe("daily upkeep", () => {
  it("refreshes the social proof and carries on if that fails", async () => {
    expect((await runUpkeep(deps())).proof_rows).toBe(4);
    const r = await runUpkeep(deps({ refreshProof: vi.fn().mockRejectedValue(new Error("x")) }));
    expect(r).toMatchObject({ proof_rows: 0, gifts_ended: 2 });
  });
  it("reports gifts ended and cleared", async () => {
    const r = await runUpkeep(deps());
    expect(r).toMatchObject({ gifts_ended: 2, gifts_unclaimed: 1, gifts_resent: 0 });
  });
  it("re-sends an undelivered gift and marks it delivered only after the send worked", async () => {
    const d = deps({ undeliveredGifts: vi.fn().mockResolvedValue([gift("g1"), gift("g2")]), sendGift: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false) });
    const r = await runUpkeep(d);
    expect(r.gifts_resent).toBe(1);
    expect(r.gifts_failed).toBe(1);
    expect(d.markGiftDelivered).toHaveBeenCalledTimes(1);
    expect(d.markGiftDelivered).toHaveBeenCalledWith("g1");
  });
  it("keeps going when one gift throws", async () => {
    const d = deps({ undeliveredGifts: vi.fn().mockResolvedValue([gift("g1"), gift("g2")]), sendGift: vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce(true) });
    const r = await runUpkeep(d);
    expect(r).toMatchObject({ gifts_resent: 1, gifts_failed: 1 });
  });
  it("sends a student reminder and marks it", async () => {
    const d = deps({ studentDue: vi.fn().mockResolvedValue([stu("u1", "recheck")]) });
    const r = await runUpkeep(d);
    expect(r.student_rechecks).toBe(1);
    expect(d.sendRecheck).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1" }), 50);
    expect(d.markStudent).toHaveBeenCalledWith("u1", "recheck_sent");
  });
  it("takes the discount off before marking and telling the reader", async () => {
    const order: string[] = [];
    const d = deps({
      studentDue: vi.fn().mockResolvedValue([stu("u2", "expired")]),
      removeDiscount: vi.fn(async () => void order.push("remove")),
      markStudent: vi.fn(async () => void order.push("mark")),
      sendEnded: vi.fn(async () => (order.push("mail"), true)),
    });
    const r = await runUpkeep(d);
    expect(order).toEqual(["remove", "mark", "mail"]);
    expect(r.student_ended).toBe(1);
  });
  it("marks nothing when the discount cannot be removed, so the next run tries again", async () => {
    const d = deps({ studentDue: vi.fn().mockResolvedValue([stu("u3", "expired")]), removeDiscount: vi.fn().mockRejectedValue(new Error("stripe")) });
    const r = await runUpkeep(d);
    expect(r).toMatchObject({ student_ended: 0, student_failed: 1 });
    expect(d.markStudent).not.toHaveBeenCalled();
    expect(d.sendEnded).not.toHaveBeenCalled();
  });
  it("leaves students alone while the feature is off", async () => {
    const d = deps({ studentOn: false, studentDue: vi.fn().mockResolvedValue([stu("u4", "expired")]) });
    await runUpkeep(d);
    expect(d.studentDue).not.toHaveBeenCalled();
  });
});
