/**
 * The daily conversion upkeep, as logic with its edges passed in so it can be
 * tested without a database or Stripe. app/api/membership/upkeep/route.ts
 * wires the real ones.
 *
 * It does four jobs:
 *  1. Ends gifts that have run out and clears unclaimed ones (5.6).
 *  2. Re-sends the claim email for a paid gift that was never marked
 *     delivered. The Stripe webhook answers 200 even when a send fails, so
 *     this is what stops a paid gift going missing (5.7).
 *  3. Refreshes the social proof counts (5.12) so they stay true and fresh.
 *  4. Student price (14.22): a month before a confirmation ends, one reminder
 *     to confirm again. After it ends, take the discount off the
 *     subscription, then tell the reader.
 *
 * One bad item never stops the rest. Counts only come back, never addresses.
 */

export interface UndeliveredGift {
  id: string;
  months: number;
  recipientEmail: string;
  recipientName: string | null;
  senderName: string | null;
  message: string | null;
  token: string;
  claimBy: string | null;
}

export interface StudentDueRow {
  userId: string;
  email: string;
  expiresAt: string;
  due: "recheck" | "expired";
}

export interface UpkeepDeps {
  studentOn: boolean;
  percent: number;
  refreshProof(): Promise<number>;
  expireGifts(): Promise<{ ended: number; unclaimed: number }>;
  undeliveredGifts(): Promise<UndeliveredGift[]>;
  sendGift(g: UndeliveredGift): Promise<boolean>;
  markGiftDelivered(id: string): Promise<void>;
  studentDue(): Promise<StudentDueRow[]>;
  sendRecheck(s: StudentDueRow, percent: number): Promise<boolean>;
  removeDiscount(userId: string): Promise<void>;
  sendEnded(s: StudentDueRow): Promise<boolean>;
  markStudent(userId: string, what: "recheck_sent" | "discount_removed"): Promise<void>;
}

export interface UpkeepCounts {
  gifts_ended: number;
  gifts_unclaimed: number;
  gifts_resent: number;
  gifts_failed: number;
  proof_rows: number;
  student_rechecks: number;
  student_ended: number;
  student_failed: number;
}

export async function runUpkeep(deps: UpkeepDeps): Promise<UpkeepCounts> {
  const out: UpkeepCounts = { gifts_ended: 0, gifts_unclaimed: 0, gifts_resent: 0, gifts_failed: 0, proof_rows: 0, student_rechecks: 0, student_ended: 0, student_failed: 0 };

  // A failed refresh must not stop the rest. The old counts go stale and hide themselves.
  out.proof_rows = await deps.refreshProof().catch(() => 0);

  const expired = await deps.expireGifts();
  out.gifts_ended = expired.ended;
  out.gifts_unclaimed = expired.unclaimed;

  for (const g of await deps.undeliveredGifts()) {
    try {
      if (await deps.sendGift(g)) {
        await deps.markGiftDelivered(g.id);
        out.gifts_resent += 1;
      } else {
        out.gifts_failed += 1;
      }
    } catch {
      out.gifts_failed += 1;
    }
  }

  if (deps.studentOn) {
    for (const s of await deps.studentDue()) {
      try {
        if (s.due === "recheck") {
          if (await deps.sendRecheck(s, deps.percent)) {
            await deps.markStudent(s.userId, "recheck_sent");
            out.student_rechecks += 1;
          } else {
            out.student_failed += 1;
          }
        } else {
          // The discount comes off first. If that fails nothing is marked, so the next run tries again.
          await deps.removeDiscount(s.userId);
          await deps.markStudent(s.userId, "discount_removed");
          await deps.sendEnded(s).catch(() => false);
          out.student_ended += 1;
        }
      } catch {
        out.student_failed += 1;
      }
    }
  }
  return out;
}
