import { describe, expect, it } from "vitest";
import { applyPendingCredits, extendedTrialEnd, processFirstPayment, type ClaimedReward, type ReferrerState, type RewardDeps } from "./referral-reward";

function makeDeps(over: Partial<RewardDeps> & { state?: ReferrerState; reward?: ClaimedReward | null; referrer?: string | null } = {}) {
  const calls: string[] = [];
  const state: ReferrerState = over.state ?? { customerId: "cus_ref", subscriptionId: "sub_ref", trialing: false, trialEnd: null };
  const reward: ClaimedReward | null =
    over.reward === undefined ? { referralId: "r1", referrerId: "u_ref", kind: "credit", value: 500, currency: "GBP" } : over.reward;
  const deps: RewardDeps = {
    pendingReferrer: async () => (over.referrer === undefined ? "u_ref" : over.referrer),
    paymentFingerprint: async () => "fp_friend",
    referrerState: async () => state,
    customerFingerprints: async () => ["fp_ref"],
    claim: async (a) => {
      calls.push(`claim:${a.fingerprint}:${a.referrerFingerprints.join("|")}:${a.referrerTrialing}:${a.currency}`);
      return reward;
    },
    addCredit: async (a) => {
      calls.push(`credit:${a.customerId}:${a.amountMinor}:${a.currency}:${a.key}`);
      return "txn_1";
    },
    extendTrial: async (a) => {
      calls.push(`extend:${a.subscriptionId}:${a.currentTrialEnd}:${a.days}:${a.key}`);
    },
    rewardGiven: async (id, txn) => {
      calls.push(`given:${id}:${txn}`);
    },
    ...over,
  };
  return { deps, calls };
}

const inv = { invoiceId: "in_1", friendId: "u_friend", amountPaidMinor: 799, currency: "gbp" };

describe("processFirstPayment", () => {
  it("does nothing for an invoice that took no money (a trial)", async () => {
    const { deps, calls } = makeDeps();
    expect(await processFirstPayment({ ...inv, amountPaidMinor: 0 }, deps)).toBe("no_payment");
    expect(calls).toEqual([]);
  });

  it("does nothing when the friend has no referral waiting", async () => {
    const { deps, calls } = makeDeps({ referrer: null });
    expect(await processFirstPayment(inv, deps)).toBe("no_referral");
    expect(calls).toEqual([]);
  });

  it("puts credit on the referrer's Stripe balance once the claim succeeds, with a key made from the referral", async () => {
    const { deps, calls } = makeDeps();
    expect(await processFirstPayment(inv, deps)).toBe("credit_given");
    expect(calls).toEqual(["claim:fp_friend:fp_ref:false:GBP", "credit:cus_ref:500:GBP:referral:r1", "given:r1:txn_1"]);
  });

  it("gives nothing when the database refuses (same card, duplicate card or cap)", async () => {
    const { deps, calls } = makeDeps({ reward: null });
    expect(await processFirstPayment(inv, deps)).toBe("nothing_to_give");
    expect(calls).toHaveLength(1);
  });

  it("extends the trial, not credit, for a referrer still on a trial", async () => {
    const trialEnd = 1_800_000_000;
    const { deps, calls } = makeDeps({
      state: { customerId: "cus_ref", subscriptionId: "sub_ref", trialing: true, trialEnd },
      reward: { referralId: "r2", referrerId: "u_ref", kind: "trial_days", value: 14, currency: null },
    });
    expect(await processFirstPayment(inv, deps)).toBe("trial_extended");
    expect(calls).toEqual(["claim:fp_friend:fp_ref:true:GBP", `extend:sub_ref:${trialEnd}:14:referral:r2`, "given:r2:null"]);
  });

  it("records the credit as waiting when the referrer has no Stripe customer yet", async () => {
    const { deps, calls } = makeDeps({ state: { customerId: null, subscriptionId: null, trialing: false, trialEnd: null } });
    expect(await processFirstPayment(inv, deps)).toBe("credit_waiting");
    expect(calls).toEqual(["claim:fp_friend::false:GBP", "given:r1:null"]);
  });

  it("does not mark the reward given when Stripe fails, so a retry gives it", async () => {
    const { deps, calls } = makeDeps({
      addCredit: async () => {
        throw new Error("stripe down");
      },
    });
    await expect(processFirstPayment(inv, deps)).rejects.toThrow("stripe down");
    expect(calls.some((c) => c.startsWith("given"))).toBe(false);
  });

  it("does not treat a referrer as trialing without a subscription and trial end", async () => {
    const { deps, calls } = makeDeps({ state: { customerId: "cus_ref", subscriptionId: "sub_ref", trialing: true, trialEnd: null } });
    await processFirstPayment(inv, deps);
    expect(calls[0]).toContain(":false:");
  });
});

describe("applyPendingCredits", () => {
  it("lands each credit once with its own key", async () => {
    const seen: string[] = [];
    const n = await applyPendingCredits(
      "cus_x",
      [
        { id: "c1", amountMinor: 500, currency: "GBP" },
        { id: "c2", amountMinor: 500, currency: "GBP" },
      ],
      {
        addCredit: async (a) => {
          seen.push(a.key);
          return `txn_${a.key}`;
        },
        creditApplied: async (id, txn) => {
          seen.push(`${id}=${txn}`);
        },
      },
    );
    expect(n).toBe(2);
    expect(seen).toEqual(["credit:c1", "c1=txn_credit:c1", "credit:c2", "c2=txn_credit:c2"]);
  });
});

describe("extendedTrialEnd", () => {
  it("adds whole days in seconds", () => {
    expect(extendedTrialEnd(1000, 14)).toBe(1000 + 14 * 86_400);
  });
});
