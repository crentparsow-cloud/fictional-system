import { describe, expect, it } from "vitest";
import { QUIZ_COPY, QUIZ_STEPS, availableShelfChoices, progressOf, recommend, scoreCandidate, startableSignedOut, stepsFor, type QuizAnswers, type QuizCandidate } from "@/lib/quiz";

function cand(over: Partial<QuizCandidate> & { slug: string }): QuizCandidate {
  return {
    title: over.slug,
    cardLine: "A line.",
    themeId: null,
    themeName: null,
    shelfId: null,
    isDemo: false,
    safetyTier: "none",
    unitCount: 6,
    minutesPerDay: null,
    hasVersion: true,
    ...over,
  };
}

const CATALOGUE: QuizCandidate[] = [
  cand({ slug: "calm-mind", shelfId: "mind-and-mood", themeId: "settled-mind", safetyTier: "standard", unitCount: 8 }),
  cand({ slug: "lift-mood", shelfId: "mind-and-mood", themeId: "brighter-days", safetyTier: "standard", unitCount: 6 }),
  cand({ slug: "debt-down", shelfId: "money", themeId: "paying-it-down", unitCount: 4 }),
  cand({ slug: "save-more", shelfId: "money", themeId: "spending-and-saving", unitCount: 10 }),
  cand({ slug: "career-move", shelfId: "work-and-career", themeId: "words-that-land", unitCount: 6 }),
  cand({ slug: "demo-money", shelfId: "money", themeId: "paying-it-down", unitCount: 4, isDemo: true }),
  cand({ slug: "outline-only", shelfId: "money", themeId: "paying-it-down", hasVersion: false }),
];

describe("quiz recommendation rule (5.1)", () => {
  it("puts titles on the chosen shelf first", () => {
    const out = recommend(CATALOGUE, { shelfId: "money", themeId: "any", minutes: 10, length: "any" });
    expect(out.map((s) => s.candidate.slug).slice(0, 2).sort()).toEqual(["debt-down", "save-more"]);
    expect(out.every((s) => s.candidate.shelfId === "money" || s.score < 40)).toBe(true);
  });

  it("a Theme match beats a shelf-only match", () => {
    const out = recommend(CATALOGUE, { shelfId: "money", themeId: "spending-and-saving" });
    expect(out[0]!.candidate.slug).toBe("save-more");
  });

  it("uses the length bucket: exact beats next-door", () => {
    const a: QuizAnswers = { shelfId: "money", themeId: "any", length: "short" };
    expect(scoreCandidate(CATALOGUE[2]!, a)).toBeGreaterThan(scoreCandidate(CATALOGUE[3]!, a));
    expect(scoreCandidate(CATALOGUE[3]!, { ...a, length: "long" })).toBeGreaterThan(scoreCandidate(CATALOGUE[2]!, { ...a, length: "long" }));
  });

  it("uses the daily time only where the listing says, and never penalises a title that does not", () => {
    const quick = cand({ slug: "quick", shelfId: "money", minutesPerDay: 5 });
    const long = cand({ slug: "long", shelfId: "money", minutesPerDay: 40 });
    const unknown = cand({ slug: "unknown", shelfId: "money" });
    const a: QuizAnswers = { shelfId: "money", minutes: 10 };
    expect(scoreCandidate(quick, a)).toBeGreaterThan(scoreCandidate(unknown, a));
    expect(scoreCandidate(unknown, a)).toBeGreaterThan(scoreCandidate(long, a));
  });

  it("never offers a title with no complete first unit", () => {
    const out = recommend(CATALOGUE, { shelfId: "money", themeId: "paying-it-down" });
    expect(out.map((s) => s.candidate.slug)).not.toContain("outline-only");
  });

  it("allows demo titles but ranks a real one above an otherwise equal demo", () => {
    const out = recommend(CATALOGUE, { shelfId: "money", themeId: "paying-it-down", length: "short" });
    const slugs = out.map((s) => s.candidate.slug);
    expect(slugs).toContain("demo-money");
    expect(slugs.indexOf("debt-down")).toBeLessThan(slugs.indexOf("demo-money"));
  });

  it("returns three, in a fixed order for the same answers", () => {
    const a: QuizAnswers = { shelfId: null, themeId: "any", minutes: 20, length: "any" };
    const one = recommend(CATALOGUE, a).map((s) => s.candidate.slug);
    const two = recommend([...CATALOGUE].reverse(), a).map((s) => s.candidate.slug);
    expect(one).toHaveLength(3);
    expect(one).toEqual(two);
  });

  it("marks exactly one title to start now", () => {
    const out = recommend(CATALOGUE, { shelfId: "money" });
    expect(out.filter((s) => s.startNow)).toHaveLength(1);
  });

  it("starts now on the best title that needs no account, even when a wellbeing title scores higher", () => {
    const out = recommend(CATALOGUE, { shelfId: "mind-and-mood", themeId: "settled-mind" });
    expect(out[0]!.candidate.slug).toBe("calm-mind");
    const start = out.find((s) => s.startNow)!;
    expect(startableSignedOut(start.candidate)).toBe(true);
    expect(start.candidate.slug).not.toBe("calm-mind");
  });

  it("falls back to the best match when every match is a wellbeing title", () => {
    const only = CATALOGUE.filter((c) => c.shelfId === "mind-and-mood");
    const out = recommend(only, { shelfId: "mind-and-mood" });
    expect(out.filter((s) => s.startNow)).toHaveLength(1);
    expect(out.find((s) => s.startNow)!.candidate.slug).toBe(out[0]!.candidate.slug);
  });

  it("gives fewer than three when the catalogue is small, and none when it is empty", () => {
    expect(recommend(CATALOGUE.slice(0, 2), {})).toHaveLength(2);
    expect(recommend([], {})).toEqual([]);
  });
});

describe("quiz shape", () => {
  it("has four questions, the engaging one first, each with a one-line reason", () => {
    expect(QUIZ_STEPS).toHaveLength(4);
    expect(QUIZ_STEPS[0]).toBe("focus");
    expect(QUIZ_COPY.focus.question).toBe("What is going on for you right now?");
    for (const step of QUIZ_STEPS) {
      expect(QUIZ_COPY[step].why.length).toBeGreaterThan(10);
      expect(QUIZ_COPY[step].why).not.toMatch(/\n/);
    }
  });

  it("fills the progress bar from step one", () => {
    expect(progressOf("focus")).toEqual({ current: 1, total: 4, percent: 25 });
    expect(progressOf("length")).toEqual({ current: 4, total: 4, percent: 100 });
  });

  it("skips the Theme question when the reader is not sure or the shelf has one Theme, and the bar follows", () => {
    expect(stepsFor({ shelfId: "money", themesOnShelf: 3 })).toEqual(["focus", "theme", "time", "length"]);
    expect(stepsFor({ shelfId: null, themesOnShelf: 9 })).toEqual(["focus", "time", "length"]);
    expect(stepsFor({ shelfId: "money", themesOnShelf: 1 })).toEqual(["focus", "time", "length"]);
    const three = stepsFor({ shelfId: null });
    expect(progressOf("time", three)).toEqual({ current: 2, total: 3, percent: 67 });
    expect(progressOf("focus", three).percent).toBeGreaterThan(0);
  });

  it("offers only shelves that have a title, and always 'not sure'", () => {
    const choices = availableShelfChoices(new Set(["money"]));
    expect(choices.map((c) => c.shelfId)).toEqual(["money", null]);
  });

  it("writes no em dash and no emoji anywhere in the copy", () => {
    const text = JSON.stringify(QUIZ_COPY);
    expect(text).not.toMatch(/—|–/);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
