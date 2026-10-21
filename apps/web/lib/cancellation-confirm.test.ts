import { describe, expect, it, vi } from "vitest";
import {
  CANCEL_EMAIL_FAILED,
  CANCEL_EMAIL_RETRY_DAYS,
  confirmationNotSent,
  outcomeOf,
  retryCancellationEmails,
  type CancelCandidate,
  type RetryOutcome,
} from "./cancellation-confirm";
import { reportOps } from "./ops-alerts";
import { periodEndCancellation } from "./stripe-webhook";
import { sendMembershipNotice } from "./membership-email";
import type { OutboundMessage, Transport } from "@akana/emails";

/**
 * R9: the confirmation is due within 24 hours. A failed send opens an ops
 * alert at once, and the daily run tries again without sending twice.
 */

const NOW = new Date("2026-10-14T09:11:00Z");
const cand = (id: string): CancelCandidate => ({ subscriptionId: id, userId: `u_${id}`, endsAt: "2026-11-06T09:00:00Z" });

describe("the daily retry", () => {
  it("looks back a few days and sends once for each membership", async () => {
    const seen: Date[] = [];
    const send = vi.fn(async (): Promise<RetryOutcome> => "sent");
    const alert = vi.fn(async () => undefined);
    const out = await retryCancellationEmails({
      now: NOW,
      candidates: async (since) => (seen.push(since), [cand("a"), cand("b")]),
      send,
      alert,
    });
    expect(out).toEqual({ checked: 2, sent: 2, already_sent: 0, no_address: 0, failed: 0 });
    expect(seen[0]!.getTime()).toBe(NOW.getTime() - CANCEL_EMAIL_RETRY_DAYS * 86_400_000);
    expect(alert).not.toHaveBeenCalled();
  });

  it("raises an ops alert when a send still fails, including a thrown error", async () => {
    const alert = vi.fn(async () => undefined);
    const out = await retryCancellationEmails({
      now: NOW,
      candidates: async () => [cand("a"), cand("b"), cand("c")],
      send: async (c) => {
        if (c.subscriptionId === "a") return "already_sent";
        if (c.subscriptionId === "b") return "failed";
        throw new Error("boom");
      },
      alert,
    });
    expect(out).toEqual({ checked: 3, sent: 0, already_sent: 1, no_address: 0, failed: 2 });
    expect(alert).toHaveBeenCalledOnce();
    expect(alert).toHaveBeenCalledWith(CANCEL_EMAIL_FAILED);
  });

  it("maps mailer statuses: a claimed key is already sent, a refusal is not a success", () => {
    expect(outcomeOf("sent")).toBe("sent");
    expect(outcomeOf("sent_test")).toBe("sent");
    expect(outcomeOf("skipped")).toBe("already_sent");
    expect(outcomeOf("failed")).toBe("failed");
    expect(confirmationNotSent({ status: "failed" })).toBe(true);
    expect(confirmationNotSent({ status: "sent" })).toBe(false);
    expect(confirmationNotSent(null)).toBe(true);
  });
});

describe("failed send, alert, retry, no double send", () => {
  const env = { RESEND_API_KEY: "re_test", EMAIL_FROM: "Akana <hello@example.test>", EMAIL_REPLY_TO: "help@example.test", POSTAL_ADDRESS: "1 Test Street", EMAIL_MODE: "live" } as const;

  it("a failure releases the claim, the retry sends, a third run sends nothing", async () => {
    const claimed = new Set<string>();
    let fail = true;
    const sent: OutboundMessage[] = [];
    const transport: Transport = async (m) => {
      if (fail) return { ok: false, error: "provider_down" };
      sent.push(m);
      return { ok: true, id: "msg_1" };
    };
    const deps = {
      env,
      claim: (k: string) => (claimed.has(k) ? false : (claimed.add(k), true)),
      release: (k: string) => void claimed.delete(k),
      log: () => undefined,
      transport,
    };
    const notice = periodEndCancellation("sub_x", "reader@example.test", "2026-11-06T09:00:00Z");

    const first = await sendMembershipNotice(notice, "https://akana.test", deps);
    expect(confirmationNotSent(first)).toBe(true);

    fail = false;
    const second = await sendMembershipNotice(notice, "https://akana.test", deps);
    expect(outcomeOf(second.status)).toBe("sent");
    expect(sent).toHaveLength(1);

    const third = await sendMembershipNotice(notice, "https://akana.test", deps);
    expect(outcomeOf(third.status)).toBe("already_sent");
    expect(sent).toHaveLength(1);
  });

  it("reportOps opens the alert on the first failure through record_ops_event and mails ops", async () => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === "record_ops_event") return { data: [{ alert_id: "al_1", notify: true }], error: null };
      return { data: null, error: null };
    });
    const transport: Transport = vi.fn(async () => ({ ok: true as const, id: "ops_1" }));
    const res = await reportOps({ rpc }, "webhook_failure", "api/stripe/webhook", CANCEL_EMAIL_FAILED, {
      env: { ...env, OPS_ALERT_TO: "ops@example.test" },
      now: NOW,
      transport,
    });
    expect(rpc).toHaveBeenCalledWith("record_ops_event", { p_kind: "webhook_failure", p_source: "api/stripe/webhook", p_code: CANCEL_EMAIL_FAILED });
    expect(res.alertId).toBe("al_1");
    expect(rpc).toHaveBeenCalledWith("mark_ops_alert_notified", { p_alert: "al_1" });
  });

  it("the webhook and the daily route both raise the alert", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
    expect(read("../app/api/stripe/webhook/route.ts")).toContain("CANCEL_EMAIL_FAILED");
    expect(read("../app/api/membership/cancel-emails/route.ts")).toContain("reportOps");
    expect(read("../vercel.json")).toContain("/api/membership/cancel-emails");
  });
});
