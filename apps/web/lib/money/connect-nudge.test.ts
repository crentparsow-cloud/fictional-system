import type { OutboundMessage } from "@akana/emails";
import { describe, expect, it } from "vitest";
import { connectNudgeKey, groupCandidates, sendConnectNudges, waitingWords, type NudgeStore } from "@/lib/money/connect-nudge";

const env = { EMAIL_MODE: "live", EMAIL_FROM: "Akana <hello@akana.test>", EMAIL_REPLY_TO: "support@akana.test", POSTAL_ADDRESS: "Akana Ltd, 1 Example Street, Edinburgh" };

function fakeStore(rows: Parameters<typeof groupCandidates>[0], claimed = new Set<string>()): NudgeStore & { claimed: Set<string> } {
  return {
    claimed,
    candidates: async () => rows,
    contacts: async (orgId) => (orgId === "org-1" ? [{ user_id: "u1", email: "owner@hold.test" }, { user_id: "u2", email: "finance@hold.test" }] : []),
    claim: (k) => (claimed.has(k) ? false : (claimed.add(k), true)),
    release: (k) => void claimed.delete(k),
  };
}

const rows = [
  { org_id: "org-1", display_name: "Hold One", connect_status: "pending", currency: "GBP", balance_minor: "5045" },
  { org_id: "org-1", display_name: "Hold One", connect_status: "pending", currency: "USD", balance_minor: 1200 },
];

describe("connect nudge", () => {
  it("writes the waiting amounts in words", () => {
    expect(waitingWords([{ currency: "GBP", balance_minor: 5045 }])).toBe("£50.45");
    expect(waitingWords([{ currency: "GBP", balance_minor: "5045" }, { currency: "USD", balance_minor: 1200 }])).toBe("£50.45 and US$12.00");
    expect(waitingWords([{ currency: "GBP", balance_minor: 0 }])).toBe("");
  });

  it("keys one nudge per organisation, recipient and ISO week", () => {
    expect(connectNudgeKey("org-1", "u1", new Date("2026-10-09T12:00:00Z"))).toBe("connect_nudge:org-1:2026-W41:u1");
    expect(connectNudgeKey("org-1", "u1", new Date("2026-10-13T12:00:00Z"))).toBe("connect_nudge:org-1:2026-W42:u1");
  });

  it("emails every owner and finance contact once a week with the one step left and the amount", async () => {
    const sent: OutboundMessage[] = [];
    const store = fakeStore(rows);
    const deps = {
      env,
      log: () => {},
      origin: "https://akana.test",
      now: () => new Date("2026-10-09T12:00:00Z"),
      transport: async (m: OutboundMessage) => {
        sent.push(m);
        return { ok: true as const, id: "re_1" };
      },
    };
    expect(await sendConnectNudges(store, deps, false)).toEqual({ organisations: 1, sent: 2, skipped: 0, failed: 0 });
    expect(sent.map((m) => m.to).sort()).toEqual(["finance@hold.test", "owner@hold.test"]);
    expect(sent[0]!.text).toContain("Hold One");
    expect(sent[0]!.text).toContain("Stripe is checking your details");
    expect(sent[0]!.text).toContain("£50.45 and US$12.00");
    expect(sent[0]!.text).toContain("https://akana.test/payouts");
    expect(sent[0]!.text).not.toMatch(/—/);

    // the next day in the same week sends nothing new
    deps.now = () => new Date("2026-10-10T12:00:00Z");
    expect(await sendConnectNudges(store, deps, false)).toEqual({ organisations: 1, sent: 0, skipped: 2, failed: 0 });
    // the week after, it goes again
    deps.now = () => new Date("2026-10-16T12:00:00Z");
    expect(await sendConnectNudges(store, deps, false)).toEqual({ organisations: 1, sent: 2, skipped: 0, failed: 0 });
    expect(sent).toHaveLength(4);
  });

  it("releases the claim when a send fails and sends nothing to a verified organisation", async () => {
    const store = fakeStore([...rows, { org_id: "org-2", display_name: "Done", connect_status: "verified", currency: "GBP", balance_minor: 900 }]);
    const deps = { env, log: () => {}, origin: "https://akana.test", transport: async () => ({ ok: false as const, error: "down" }) };
    expect(await sendConnectNudges(store, deps, false)).toEqual({ organisations: 1, sent: 0, skipped: 0, failed: 2 });
    expect(store.claimed.size).toBe(0);
  });
});
