import { describe, expect, it } from "vitest";
import {
  applyPendingCredits,
  extendedTrialEnd,
  processFirstPayment,
  reverseReferralReward,
  type ClaimedReward,
  type ReferrerState,
  type ReversalDeps,
  type ReversalRow,
  type RewardDeps,
} from "./referral-reward";

function makeDeps(over: Partial<RewardDeps> & { state?: ReferrerState; reward?: ClaimedReward | null; referrer?: string | null } = {}) {
  const calls: string[] = [];
  const state: ReferrerState = over.state ?? { customerId: "cus_ref", subscriptionId: "sub_ref", trialing: false, trialEnd: null };
  const reward: ClaimedReward | null =
    over.reward === undefined ? { referralId: "r1", referrerId: "u_ref", kind: "credit", value: 500, currency: "GBP", trialEndTarget: null } : over.reward;
  const deps: RewardDeps = {
    pendingReferrer: async () => (over.referrer === undefined ? "u_ref" : over.referrer),
    paymentInfo: async () => ({ fingerprint: "fp_friend", paymentIntentId: "pi_friend", disputed: false }),
    referrerState: async () => state,
    customerFingerprints: async () => ["fp_ref"],
    claim: async (a) => {
      calls.push(`claim:${a.fingerprint}:${a.referrerFingerprints.join("|")}:${a.referrerTrialing}:${a.currency}`);
      calls.push(`pay:${a.invoiceId}:${a.paymentIntentId}:${a.disputed}:${a.referrerTrialEnd}`);
      return reward;
    },
    addCredit: async (a) => {
      calls.push(`credit:${a.customerId}:${a.amountMinor}:${a.currency}:${a.key}`);
      return "txn_1";
    },
    extendTrial: async (a) => {
      calls.push(`extend:${a.subscriptionId}:${a.trialEnd}:${a.key}`);
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
    expect(calls).toEqual(["claim:fp_friend:fp_ref:false:GBP", "pay:in_1:pi_friend:false:null", "credit:cus_ref:500:GBP:referral:r1", "given:r1:txn_1"]);
  });

  it("gives nothing when the database refuses (same card, duplicate card or cap)", async () => {
    const { deps, calls } = makeDeps({ reward: null });
    expect(await processFirstPayment(inv, deps)).toBe("nothing_to_give");
    expect(calls).toHaveLength(2);
  });

  it("extends the trial, not credit, for a referrer still on a trial", async () => {
    const trialEnd = 1_800_000_000;
    const { deps, calls } = makeDeps({
      state: { customerId: "cus_ref", subscriptionId: "sub_ref", trialing: true, trialEnd },
      reward: { referralId: "r2", referrerId: "u_ref", kind: "trial_days", value: 14, currency: null, trialEndTarget: trialEnd + 14 * 86_400 },
    });
    expect(await processFirstPayment(inv, deps)).toBe("trial_extended");
    expect(calls).toEqual([
      "claim:fp_friend:fp_ref:true:GBP",
      `pay:in_1:pi_friend:false:${trialEnd}`,
      `extend:sub_ref:${trialEnd + 14 * 86_400}:referral:r2`,
      "given:r2:null",
    ]);
  });

  it("uses the stored target on a retry, so the days are not added twice", async () => {
    // The first try moved Stripe's trial end, then failed before recording the reward.
    const first = 1_800_000_000;
    const target = first + 14 * 86_400;
    const { deps, calls } = makeDeps({
      state: { customerId: "cus_ref", subscriptionId: "sub_ref", trialing: true, trialEnd: target },
      reward: { referralId: "r2", referrerId: "u_ref", kind: "trial_days", value: 14, currency: null, trialEndTarget: target },
    });
    expect(await processFirstPayment(inv, deps)).toBe("trial_extended");
    expect(calls).toContain(`extend:sub_ref:${target}:referral:r2`);
  });

  it("passes a dispute on the first payment to the claim", async () => {
    const { deps, calls } = makeDeps({
      reward: null,
      paymentInfo: async () => ({ fingerprint: "fp_friend", paymentIntentId: "pi_d", disputed: true }),
    });
    expect(await processFirstPayment(inv, deps)).toBe("nothing_to_give");
    expect(calls).toContain("pay:in_1:pi_d:true:null");
  });

  it("records the credit as waiting when the referrer has no Stripe customer yet", async () => {
    const { deps, calls } = makeDeps({ state: { customerId: null, subscriptionId: null, trialing: false, trialEnd: null } });
    expect(await processFirstPayment(inv, deps)).toBe("credit_waiting");
    expect(calls).toEqual(["claim:fp_friend::false:GBP", "pay:in_1:pi_friend:false:null", "given:r1:null"]);
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

function reversalDeps(row: ReversalRow | null, state: ReferrerState) {
  const calls: string[] = [];
  const deps: ReversalDeps = {
    reverse: async (pi, reason) => {
      calls.push(`reverse:${pi}:${reason}`);
      return row;
    },
    referrerState: async () => state,
    debitCredit: async (a) => {
      calls.push(`debit:${a.customerId}:${a.amountMinor}:${a.currency}:${a.key}`);
      return "txn_back";
    },
    setTrialEnd: async (a) => {
      calls.push(`trial:${a.subscriptionId}:${a.trialEnd}:${a.key}`);
    },
    reversed: async (id, txn) => {
      calls.push(`reversed:${id}:${txn}`);
    },
  };
  return { deps, calls };
}

describe("reverseReferralReward", () => {
  const now = 1_800_000_000;
  const paying: ReferrerState = { customerId: "cus_ref", subscriptionId: "sub_ref", trialing: false, trialEnd: null };

  it("does nothing when the payment earned no reward", async () => {
    const { deps, calls } = reversalDeps(null, paying);
    expect(await reverseReferralReward("pi_1", "refunded", deps, now)).toBe("nothing_to_reverse");
    expect(calls).toEqual(["reverse:pi_1:refunded"]);
  });

  it("takes credit back off the balance with a key made from the referral", async () => {
    const { deps, calls } = reversalDeps({ referralId: "r1", referrerId: "u", action: "debit", value: 500, currency: "GBP", trialEndTarget: null }, paying);
    expect(await reverseReferralReward("pi_1", "disputed", deps, now)).toBe("credit_taken_back");
    expect(calls).toEqual(["reverse:pi_1:disputed", "debit:cus_ref:500:GBP:referral-reversal:r1", "reversed:r1:txn_back"]);
  });

  it("does not record the reversal when Stripe fails, so a retry does it", async () => {
    const { deps, calls } = reversalDeps({ referralId: "r1", referrerId: "u", action: "debit", value: 500, currency: "GBP", trialEndTarget: null }, paying);
    deps.debitCredit = async () => {
      throw new Error("stripe down");
    };
    await expect(reverseReferralReward("pi_1", "refunded", deps, now)).rejects.toThrow("stripe down");
    expect(calls.some((c) => c.startsWith("reversed"))).toBe(false);
  });

  it("takes the extra days off a trial that is still running", async () => {
    const target = now + 20 * 86_400;
    const { deps, calls } = reversalDeps(
      { referralId: "r2", referrerId: "u", action: "shorten_trial", value: 14, currency: null, trialEndTarget: target },
      { customerId: "cus_ref", subscriptionId: "sub_ref", trialing: true, trialEnd: target },
    );
    expect(await reverseReferralReward("pi_2", "refunded", deps, now)).toBe("trial_shortened");
    expect(calls).toContain(`trial:sub_ref:${now + 6 * 86_400}:referral-reversal:r2`);
  });

  it("ends the trial now when the original end has passed", async () => {
    const target = now + 3 * 86_400;
    const { deps, calls } = reversalDeps(
      { referralId: "r3", referrerId: "u", action: "shorten_trial", value: 14, currency: null, trialEndTarget: target },
      { customerId: "cus_ref", subscriptionId: "sub_ref", trialing: true, trialEnd: target },
    );
    await reverseReferralReward("pi_3", "refunded", deps, now);
    expect(calls).toContain("trial:sub_ref:now:referral-reversal:r3");
  });

  it("leaves a trial that has already been billed", async () => {
    const { deps, calls } = reversalDeps(
      { referralId: "r4", referrerId: "u", action: "shorten_trial", value: 14, currency: null, trialEndTarget: now - 86_400 },
      paying,
    );
    expect(await reverseReferralReward("pi_4", "refunded", deps, now)).toBe("trial_already_billed");
    expect(calls.some((c) => c.startsWith("trial:"))).toBe(false);
    expect(calls).toContain("reversed:r4:null");
  });
});
