import { describe, expect, it } from "vitest";
import { discussionGuide, GROUND_RULES, parseKitSource, talkOutline, welcomeSlides } from "./group-kit";

const SOURCE = {
  workbook_title: "Staying steady",
  faith: false,
  start: { start: { welcome: "Welcome to the workbook.", how_it_works: ["Read a week at a time.", "Do the exercises.", "Keep your answers private."] } },
  units: [
    {
      number: 2,
      focus: "Noticing small wins",
      intro: "Small wins add up.",
      ideas: [{ heading: "Count the small things", body: "Notice what went fine.", example: "A short walk." }],
      takeaway: "Small things count.",
      exercises: [{ title: "Three good things", purpose: "Notice what went well.", minutes: 10, steps: [{ text: "Write three things." }], fields: [{ id: "a", label: "Secret question" }] }],
    },
    { number: 1, focus: "Where you are now", exercises: [] },
  ],
};

describe("parseKitSource", () => {
  it("reads the source and sorts the units", () => {
    const k = parseKitSource(SOURCE)!;
    expect(k.title).toBe("Staying steady");
    expect(k.units.map((u) => u.number)).toEqual([1, 2]);
    expect(k.howItWorks).toHaveLength(3);
  });
  it("returns null for nothing usable", () => {
    expect(parseKitSource(null)).toBeNull();
    expect(parseKitSource({ workbook_title: "T", units: [] })).toBeNull();
    expect(parseKitSource({ units: [{ focus: "x" }] })).toBeNull();
    expect(parseKitSource("nope")).toBeNull();
  });
  it("drops odd units and tidies text", () => {
    const k = parseKitSource({ workbook_title: " A\n B ", units: [{ number: 1, focus: "  ok  " }, { number: 2 }, 7] })!;
    expect(k.title).toBe("A B");
    expect(k.units).toHaveLength(1);
  });
  it("does not carry field labels, which could prompt personal answers", () => {
    expect(JSON.stringify(parseKitSource(SOURCE))).not.toContain("Secret question");
  });
});

describe("talkOutline", () => {
  const k = parseKitSource(SOURCE)!;
  it("builds blocks and adds the minutes up", () => {
    const o = talkOutline(k.units[1]!);
    expect(o.blocks.map((b) => b.heading)).toEqual(["Welcome", "The ideas", "What people do this week", "Close"]);
    expect(o.totalMinutes).toBe(o.blocks.reduce((n, b) => n + b.minutes, 0));
    expect(o.blocks[0]!.points.join(" ")).toContain("Noticing small wins");
  });
  it("copes with a unit that has only a focus", () => {
    const o = talkOutline(k.units[0]!);
    expect(o.blocks.map((b) => b.heading)).toEqual(["Welcome", "Close"]);
  });
  it("always reminds people about Help now", () => {
    expect(talkOutline(k.units[0]!).blocks.at(-1)!.points.join(" ")).toContain("Help now");
  });
});

describe("discussionGuide", () => {
  const k = parseKitSource(SOURCE)!;
  it("never asks anyone to share what they wrote, or counts of days", () => {
    const g = discussionGuide(k.units[1]!);
    const all = g.questions.join(" ").toLowerCase();
    expect(all).not.toMatch(/read out|read aloud|share what you wrote|how many days|missed|streak|behind/);
    expect(g.questions.some((q) => q.includes("Without saying what you wrote"))).toBe(true);
    expect(g.intro).toContain("Nobody has to share");
  });
  it("still gives questions for a thin unit", () => {
    expect(discussionGuide(k.units[0]!).questions.length).toBeGreaterThanOrEqual(2);
  });
});

describe("welcomeSlides", () => {
  const k = parseKitSource(SOURCE)!;
  it("makes six slides with the ground rules and the weeks", () => {
    const s = welcomeSlides(k, "Tuesday group");
    expect(s).toHaveLength(6);
    expect(s[0]!.title).toBe("Welcome to Tuesday group");
    expect(s[3]!.lines).toEqual([...GROUND_RULES]);
    expect(s[4]!.lines).toEqual(["Week 1: Where you are now", "Week 2: Noticing small wins"]);
  });
  it("says answers are private and uses no emoji or em dash", () => {
    const all = JSON.stringify(welcomeSlides(k));
    expect(all).toContain("Your answers are private");
    expect(all).not.toContain("—");
    expect(all).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
