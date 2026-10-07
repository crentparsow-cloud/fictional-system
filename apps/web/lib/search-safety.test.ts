import { describe, expect, it } from "vitest";
import { CRISIS_PHRASES, CRISIS_STEMS, isCrisisQuery, normaliseQuery } from "./search-safety";

describe("normaliseQuery", () => {
  it("lower cases, strips accents and punctuation, and collapses spaces", () => {
    expect(normaliseQuery("  Café   CULTURE!! ")).toBe("cafe culture");
    expect(normaliseQuery("self-harm")).toBe("self harm");
    expect(normaliseQuery("AK-00012")).toBe("ak 00012");
  });

  it("drops straight and curly apostrophes so contractions read as one word", () => {
    expect(normaliseQuery("can't go on")).toBe("cant go on");
    expect(normaliseQuery("I don’t want to live")).toBe("i dont want to live");
    expect(normaliseQuery("I'm")).toBe("im");
  });

  it("folds common long forms and slang", () => {
    expect(normaliseQuery("I cannot cope")).toBe("i cant cope");
    expect(normaliseQuery("I can not go on")).toBe("i cant go on");
    expect(normaliseQuery("I do not want to live")).toBe("i dont want to live");
    expect(normaliseQuery("i wanna die")).toBe("i want to die");
    expect(normaliseQuery("hurt my self")).toBe("hurt myself");
  });

  it("is empty for empty or punctuation-only input", () => {
    expect(normaliseQuery("")).toBe("");
    expect(normaliseQuery("   ")).toBe("");
    expect(normaliseQuery("?!.,")).toBe("");
    expect(normaliseQuery(undefined as unknown as string)).toBe("");
  });

  it("caps very long input", () => {
    expect(normaliseQuery("a".repeat(5000)).length).toBeLessThanOrEqual(200);
  });
});

describe("crisis term list", () => {
  it("is written already normalised, so every entry can match", () => {
    for (const phrase of CRISIS_PHRASES) expect(normaliseQuery(phrase), phrase).toBe(phrase);
    for (const stem of CRISIS_STEMS) expect(stem).toMatch(/^[a-z]+$/);
  });

  it("has no duplicates", () => {
    expect(new Set(CRISIS_PHRASES).size).toBe(CRISIS_PHRASES.length);
  });

  it("matches every listed phrase on its own and inside a sentence", () => {
    for (const phrase of CRISIS_PHRASES) {
      expect(isCrisisQuery(phrase), phrase).toBe(true);
      expect(isCrisisQuery(`I think ${phrase} tonight`), phrase).toBe(true);
    }
  });
});

describe("isCrisisQuery", () => {
  const crisis = [
    "I want to die",
    "i wanna die",
    "suicide",
    "Suicidal thoughts",
    "SUICIDAL",
    "feeling suicidal",
    "sucidal",
    "kill myself",
    "how to kill my self",
    "killmyself",
    "I can't go on",
    "i cant go on anymore",
    "I cannot cope",
    "can’t take it anymore",
    "self harm",
    "self-harm",
    "selfharm",
    "self harming",
    "Self-Injury",
    "I keep cutting myself",
    "overdose",
    "overdosing on paracetamol",
    "took too many pills",
    "abuse",
    "my partner is abusive",
    "domestic abuse",
    "domestic violence",
    "I am in danger",
    "not safe at home",
    "end my life",
    "I don't want to be here",
    "I do not want to live",
    "better off dead",
    "unalive myself",
    "raped",
    "sexual assault",
    "wish I was dead",
    "no reason to live",
  ];
  for (const q of crisis) {
    it(`flags "${q}"`, () => expect(isCrisisQuery(q)).toBe(true));
  }

  const ordinary = [
    "",
    "   ",
    "budget",
    "Calm",
    "sleep better",
    "grief",
    "anxiety",
    "anger",
    "find anger",
    "die hard",
    "dieting",
    "career change",
    "money for later",
    "chosen habits",
    "Marcus Aurelius",
    "meditations",
    "grapes",
    "dangerous liaisons",
    "self care",
    "self compassion",
    "cut costs",
    "pill organiser",
    "AK-00012",
    "kind words",
    "dog grooming",
    "end of year review",
    "take my time",
    "carry on writing",
    "going on holiday",
  ];
  for (const q of ordinary) {
    it(`does not flag "${q}"`, () => expect(isCrisisQuery(q)).toBe(false));
  }
});
