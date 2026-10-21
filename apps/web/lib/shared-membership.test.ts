import { describe, expect, it } from "vitest";
import {
  ACCEPT_MESSAGES,
  INVITE_STATEMENTS,
  SHARED_NOTICES,
  SHARED_PLAN_POSITIONING,
  buyerSeatLine,
  buyerSeatView,
  isAcceptOutcome,
  isMonthThree,
  memberSeatLine,
  sharedNotice,
  sharedPlanOffer,
  sharedPlanOpen,
  type SharedOfferPlacement,
} from "./shared-membership";
import { hashInviteToken, inviteUrl, isInviteToken, newInviteToken } from "./shared-membership-token";

const OPEN = { STRIPE_PRICE_MEMBERSHIP_TWO_MONTHLY: "price_1Two" };
const NOW = new Date("2026-10-10T09:00:00Z");
const fmt = (iso: string) => iso.slice(0, 10);

describe("the invitation token", () => {
  it("is 32 URL-safe characters and different every time", () => {
    const a = newInviteToken();
    const b = newInviteToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(isInviteToken(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  it("rejects anything that is not a token", () => {
    for (const bad of ["", "short", "x".repeat(33), `${"a".repeat(31)}!`, null, undefined, 12]) expect(isInviteToken(bad)).toBe(false);
  });

  it("is stored as a 64 character sha256 hash that does not contain the token", () => {
    const t = newInviteToken();
    const h = hashInviteToken(t);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(t);
    expect(hashInviteToken(t)).toBe(h);
    expect(hashInviteToken("a".repeat(32))).toBe("3ba3f5f43b92602683c19aee62a20342b084dd5971ddd33808d81a328879a547");
  });

  it("builds the link on the path, tolerating a trailing slash", () => {
    const t = "a".repeat(32);
    expect(inviteUrl("https://akana.test", t)).toBe(`https://akana.test/share/${t}`);
    expect(inviteUrl("https://akana.test/", t)).toBe(`https://akana.test/share/${t}`);
  });
});

describe("the two-person plan is closed until its Stripe price is set", () => {
  it("is shut with nothing set or something that is not a price id", () => {
    expect(sharedPlanOpen({})).toBe(false);
    expect(sharedPlanOpen({ STRIPE_PRICE_MEMBERSHIP_TWO_MONTHLY: "prod_1" })).toBe(false);
    expect(sharedPlanOpen(OPEN)).toBe(true);
  });

  it("hides every offer while shut", () => {
    for (const p of ["pricing", "post_trial", "cancellation", "month_three"] as SharedOfferPlacement[]) expect(sharedPlanOffer(p, {})).toBeNull();
  });
});

describe("offer copy", () => {
  const placements: SharedOfferPlacement[] = ["pricing", "post_trial", "cancellation", "month_three"];

  it("carries the positioning line at every hook point", () => {
    expect(SHARED_PLAN_POSITIONING).toBe("Two people, one price, each with sealed answers");
    for (const p of placements) {
      const o = sharedPlanOffer(p, OPEN);
      expect(o?.headline).toBe(SHARED_PLAN_POSITIONING);
      expect(o?.placement).toBe(p);
    }
  });

  it("follows the house rules: no em dashes, no emojis, no free, no countdown, no struck prices", () => {
    const texts: string[] = [...INVITE_STATEMENTS, ...Object.values(ACCEPT_MESSAGES), ...Object.values(SHARED_NOTICES), memberSeatLine({ id: "x", status: "active", accepted_at: null }) ?? ""];
    for (const p of placements) {
      const o = sharedPlanOffer(p, OPEN);
      texts.push(o?.headline ?? "", o?.body ?? "", o?.cta ?? "");
    }
    for (const t of texts) {
      expect(t).not.toMatch(/—|–/);
      expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(t).not.toMatch(/\bfree\b|countdown|hurry|last chance|only \d+ left|was £/i);
    }
  });

  it("says on the cancellation screen that sharing may help, and nowhere else", () => {
    expect(sharedPlanOffer("cancellation", OPEN)?.body).toMatch(/sharing may help/);
    expect(sharedPlanOffer("pricing", OPEN)?.body).not.toMatch(/sharing may help/);
  });

  it("tells the invitee what they get, who pays and that they can be removed", () => {
    const all = INVITE_STATEMENTS.join(" ");
    expect(all).toMatch(/sealed/);
    expect(all).toMatch(/cannot read/);
    expect(all).toMatch(/can remove you at any time/);
    expect(all).toMatch(/pays for the membership/);
    expect(all).toMatch(/their current period ends/);
  });
});

describe("month three", () => {
  const base = { plan: "member_month", status: "active", cancelAtPeriodEnd: false };
  it("is the fourth month of a single membership", () => {
    expect(isMonthThree({ ...base, startedAt: "2026-07-10T09:00:00Z" }, NOW)).toBe(true);
    expect(isMonthThree({ ...base, startedAt: "2026-07-10T09:00:01Z" }, NOW)).toBe(true);
    expect(isMonthThree({ ...base, startedAt: "2026-07-11T09:00:00Z" }, NOW)).toBe(false);
    expect(isMonthThree({ ...base, startedAt: "2026-06-10T09:00:00Z" }, NOW)).toBe(false);
  });
  it("is not offered to the two-person plan, to an ending one or to one that has stopped", () => {
    expect(isMonthThree({ ...base, plan: "member_two_month", startedAt: "2026-07-10T09:00:00Z" }, NOW)).toBe(false);
    expect(isMonthThree({ ...base, cancelAtPeriodEnd: true, startedAt: "2026-07-10T09:00:00Z" }, NOW)).toBe(false);
    expect(isMonthThree({ ...base, status: "canceled", startedAt: "2026-07-10T09:00:00Z" }, NOW)).toBe(false);
  });
});

describe("the You page", () => {
  const row = (over: Partial<Record<string, string | null>> = {}) => ({
    seat_id: null,
    seat_status: null,
    invited_at: null,
    expires_at: null,
    accepted_at: null,
    ...over,
  });

  it("shows nothing for a buyer who is not on the two-person plan", () => {
    expect(buyerSeatView(null, NOW)).toEqual({ kind: "none" });
    expect(buyerSeatView([], NOW)).toEqual({ kind: "none" });
    expect(buyerSeatLine({ kind: "none" }, fmt)).toBe("");
  });

  it("reads the second place from the row, never naming who holds it", () => {
    expect(buyerSeatView([row()], NOW)).toEqual({ kind: "empty" });
    expect(buyerSeatView([row({ seat_status: "invited", expires_at: "2026-10-20T00:00:00Z" })], NOW)).toEqual({
      kind: "invited",
      expiresAt: "2026-10-20T00:00:00Z",
      expired: false,
    });
    expect(buyerSeatView([row({ seat_status: "invited", expires_at: "2026-10-01T00:00:00Z" })], NOW)).toMatchObject({ kind: "invited", expired: true });
    expect(buyerSeatView([row({ seat_status: "active", accepted_at: "2026-10-02T00:00:00Z" })], NOW)).toEqual({ kind: "joined", since: "2026-10-02T00:00:00Z" });
    const lines = [
      buyerSeatLine({ kind: "empty" }, fmt),
      buyerSeatLine({ kind: "invited", expiresAt: "2026-10-20T00:00:00Z", expired: false }, fmt),
      buyerSeatLine({ kind: "invited", expiresAt: null, expired: true }, fmt),
      buyerSeatLine({ kind: "joined", since: "2026-10-02T00:00:00Z" }, fmt),
    ];
    expect(lines[1]).toContain("2026-10-20");
    expect(lines[2]).toMatch(/expired/);
    for (const l of lines) expect(l).not.toMatch(/@|user|email/i);
  });

  it("tells a member they pay nothing, can leave, and keep their answers", () => {
    expect(memberSeatLine(null)).toBeNull();
    expect(memberSeatLine({ id: "s", status: "left", accepted_at: null })).toBeNull();
    const line = memberSeatLine({ id: "s", status: "active", accepted_at: "2026-10-02T00:00:00Z" });
    expect(line).toMatch(/pay nothing/);
    expect(line).toMatch(/leave at any time/);
    expect(line).toMatch(/answers stay yours/);
  });

  it("knows only its own notices and outcomes", () => {
    expect(sharedNotice("left")).toBe(SHARED_NOTICES.left);
    expect(sharedNotice(["removed"])).toBe(SHARED_NOTICES.removed);
    expect(sharedNotice("nope")).toBeNull();
    expect(sharedNotice(undefined)).toBeNull();
    expect(isAcceptOutcome("joined")).toBe(true);
    expect(isAcceptOutcome("has_membership")).toBe(true);
    expect(isAcceptOutcome("anything")).toBe(false);
    for (const k of Object.keys(ACCEPT_MESSAGES)) expect(isAcceptOutcome(k)).toBe(true);
  });
});
