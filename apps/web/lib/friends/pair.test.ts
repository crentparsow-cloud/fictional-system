import { describe, expect, it } from "vitest";
import {
  ACCEPT_MESSAGES,
  INVITE_STATEMENTS,
  NUDGE_BUTTONS,
  NUDGE_CODES,
  cleanLabel,
  inviteUrl,
  isAcceptOutcome,
  isNudgeCode,
  nudgeChoices,
  nudgeText,
  pairNotice,
  pollDelayMs,
  statusLine,
  talkItOver,
  TALK_IT_OVER_NOTE,
} from "@/lib/friends/pair";

const ALL_TEXT = () => [
  ...NUDGE_CODES.map((c) => nudgeText(c, "Sam")),
  ...Object.values(NUDGE_BUTTONS),
  ...Object.values(ACCEPT_MESSAGES),
  ...INVITE_STATEMENTS,
  statusLine({ label: "Sam", friendFinishedToday: true }),
  statusLine({ label: "Sam", friendFinishedToday: false }),
  ...Array.from({ length: 8 }, (_, i) => talkItOver(i)),
  TALK_IT_OVER_NOTE,
];

describe("nudges", () => {
  it("always read as coming from the friend, by the name they chose", () => {
    for (const code of NUDGE_CODES) expect(nudgeText(code, "My sister")).toContain("My sister");
    expect(nudgeText("no_rush", "  ")).toContain("Your friend");
  });
  it("offers a cheer only after a finish, and prompts only before", () => {
    expect(nudgeChoices(true)).toEqual(["nice_one"]);
    expect(nudgeChoices(false)).not.toContain("nice_one");
    expect(nudgeChoices(false).length).toBeGreaterThan(1);
  });
  it("knows its codes", () => {
    expect(NUDGE_CODES.every(isNudgeCode)).toBe(true);
    expect(isNudgeCode("hurry_up")).toBe(false);
    expect(isNudgeCode(null)).toBe(false);
  });
});

describe("house rules for the wording", () => {
  it("has no em dashes, streaks, counts, countdowns or guilt", () => {
    for (const text of ALL_TEXT()) {
      expect(text).not.toContain(String.fromCharCode(0x2014));
      expect(text).not.toMatch(/streak|missed|behind|falling|only \d|\d+ days|last chance|hurry|don't let|lose/i);
    }
  });
  it("uses short sentences", () => {
    for (const text of ALL_TEXT()) for (const s of text.split(/(?<=[.?!])\s+/)) expect(s.split(/\s+/).length).toBeLessThanOrEqual(25);
  });
});

describe("talk it over", () => {
  it("is the same prompt for the same step and cycles", () => {
    expect(talkItOver(3)).toBe(talkItOver(3));
    expect(talkItOver(0)).toBe(talkItOver(8));
    expect(new Set(Array.from({ length: 8 }, (_, i) => talkItOver(i))).size).toBe(8);
    expect(typeof talkItOver(NaN)).toBe("string");
  });
  it("tells the reader nothing they wrote is passed on", () => {
    expect(TALK_IT_OVER_NOTE).toMatch(/does not pass on/);
  });
});

describe("labels, links and outcomes", () => {
  it("cleans labels", () => {
    expect(cleanLabel("  My   sister ")).toBe("My sister");
    expect(cleanLabel("")).toBeNull();
    expect(cleanLabel("x".repeat(31))).toBeNull();
    expect(cleanLabel("<b>x</b>")).toBeNull();
    expect(cleanLabel(4)).toBeNull();
  });
  it("builds the invitation link", () => {
    expect(inviteUrl("https://akana.test/", "tok")).toBe("https://akana.test/friend/tok");
  });
  it("knows the outcomes the database returns", () => {
    for (const o of ["joined", "invalid", "expired", "self", "off", "not_enrolled", "busy", "bad_label"]) expect(isAcceptOutcome(o)).toBe(true);
    expect(isAcceptOutcome("whatever")).toBe(false);
    expect(pairNotice("ended")).toMatch(/deleted/);
    expect(pairNotice("<x>")).toBeNull();
  });
});

describe("polling", () => {
  it("polls quickly without Realtime, slowly with it, and not at all when hidden", () => {
    expect(pollDelayMs({ realtimeConnected: false, hidden: false })).toBe(45_000);
    expect(pollDelayMs({ realtimeConnected: true, hidden: false })).toBe(300_000);
    expect(pollDelayMs({ realtimeConnected: false, hidden: true })).toBe(0);
  });
});
