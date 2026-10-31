import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WorkbookV3 } from "@akana/schema";
import { describe, expect, it } from "vitest";
import { DEMO_PROFILE, MIND_AND_MOOD_SHELF, demoReaderPages, validateWorkbook } from "./index";
import { shelfFor, validateTargets } from "./targets";

const REPO = join(import.meta.dirname, "..", "..", "..");
const SAMPLE = join(REPO, "content", "workbooks", "demo", "a-polite-no-dj4fc.json");
type Doc = Record<string, any>;
const sample = (): Doc => JSON.parse(readFileSync(SAMPLE, "utf8")) as Doc;
const errors = (d: unknown, shelf?: string) => validateWorkbook(d, { shelf }).errors.map((e) => `${e.path}: ${e.message}`);
const hasError = (d: unknown, re: RegExp, shelf?: string) => errors(d, shelf).some((m) => re.test(m));
/** The sample turned into a Mind and Mood title on the standard tier. */
const mood = (): Doc => ({ ...sample(), genre: "wellbeing", safety_tier: "standard" });
const withIdeaBody = (d: Doc, body: string): Doc => {
  d.units[0].ideas[0].body = body;
  return d;
};
const FILLER = "This sentence is here to keep the body inside the word range for a demo idea, and it says nothing much at all.";

describe("demo profile: the sample", () => {
  it("parses with structure.unit part", () => {
    expect(WorkbookV3.parse(sample()).structure.unit).toBe("part");
  });

  it("passes with no errors, on its own shelf and through the file runner", () => {
    expect(errors(sample(), "personal-growth")).toEqual([]);
    expect(shelfFor(SAMPLE, sample())).toBe("personal-growth");
    const [r] = validateTargets([SAMPLE]);
    expect(r!.blocking).toEqual([]);
  });

  it("is about four to six reader pages", () => {
    const pages = demoReaderPages(WorkbookV3.parse(sample()));
    expect(pages).toBeGreaterThanOrEqual(DEMO_PROFILE.pages[0]);
    expect(pages).toBeLessThanOrEqual(DEMO_PROFILE.pages[1]);
  });

  it("still passes as a Mind and Mood title on the standard tier", () => {
    expect(errors(mood(), MIND_AND_MOOD_SHELF)).toEqual([]);
  });
});

describe("demo profile: shape", () => {
  it("needs the demo badge, licence_ref null and no internal block or status", () => {
    expect(hasError({ ...sample(), badge: "official" }, /badged demo/)).toBe(true);
    expect(hasError({ ...sample(), licence_ref: "x" }, /licence_ref: null/)).toBe(true);
    const noLicence = sample();
    delete noLicence.licence_ref;
    expect(hasError(noLicence, /licence_ref: null/)).toBe(true);
    expect(hasError({ ...sample(), internal: { notes: "x" } }, /no internal block/)).toBe(true);
    expect(hasError({ ...sample(), status: "live" }, /carries no status/)).toBe(true);
  });

  it("needs four parts, one free, and a demo-sized unit", () => {
    expect(hasError({ ...sample(), structure: { unit: "week", count: 4, free_units: 1 } }, /in parts/)).toBe(true);
    expect(hasError({ ...sample(), structure: { unit: "part", count: 4, free_units: 2 } }, /free_units is 1/)).toBe(true);
    const d = sample();
    d.units[0].ideas.pop();
    expect(hasError(d, /exactly 3/)).toBe(true);
    const e = sample();
    e.exercises[0].minutes = 10;
    expect(hasError(e, /4 to 6/)).toBe(true);
    const i = sample();
    i.units[1].intro = "Too short.";
    expect(hasError(i, /demo intro is 40 to 80/)).toBe(true);
    expect(hasError(withIdeaBody(sample(), "Too short to count."), /demo idea body is 40 to 70/)).toBe(true);
  });

  it("does not ask a demo for key idea examples or exercise sources, but still asks every other workbook", () => {
    expect(errors(sample()).some((m) => /example|source/.test(m))).toBe(false);
    const classic = JSON.parse(readFileSync(join(REPO, "content", "workbooks", "classics", "the-way-to-wealth.json"), "utf8")) as Doc;
    delete classic.exercises[0].source;
    expect(hasError(classic, /needs a source/)).toBe(true);
  });
});

describe("demo profile: wording", () => {
  it("fails a quotation from a book, real or invented, and allows short lines a reader might say", () => {
    const long = '"' + "Waste not the smallest part of the day, for each hour spent idly is a debt that grows" + '"';
    expect(hasError(withIdeaBody(sample(), `${long} is how one old book puts the case. ${FILLER}`), /quoted passage/)).toBe(true);
    const attributed = `As Franklin wrote, "a penny saved is a penny earned" and that line has lasted. ${FILLER}`;
    expect(hasError(withIdeaBody(sample(), attributed), /put down to a writer/)).toBe(true);
    expect(hasError(withIdeaBody(sample(), `See page 12 for more. ${FILLER}`), /citation/)).toBe(true);
    expect(errors(sample()).some((m) => /quot/.test(m))).toBe(false);
  });

  it("fails an em dash and a hyphen used as a dash", () => {
    expect(hasError(withIdeaBody(sample(), `A no is short — and kind. ${FILLER}`), /em dash/)).toBe(true);
    expect(hasError(withIdeaBody(sample(), `A no is short - and kind. ${FILLER}`), /hyphen used as a dash/)).toBe(true);
  });

  it("allows free only about Part 1, and never in a line a reader says", () => {
    expect(hasError({ ...sample(), start: { ...sample().start, welcome: "The whole workbook is free. Start when you like." } }, /'free' on a paid title/)).toBe(true);
    expect(hasError({ ...sample(), start: { ...sample().start, welcome: "Part 1 is free, and so are parts 2 to 4." } }, /'free' on a paid title/)).toBe(true);
    expect(hasError(withIdeaBody(sample(), `You might say "I am free on Monday" to keep it warm. ${FILLER}`), /'free'/)).toBe(false);
  });

  it("fails streak, goal and every day language on a Mind and Mood title", () => {
    const streak = withIdeaBody(mood(), `Keep your streak going and the words come sooner. ${FILLER}`);
    expect(hasError(streak, /streak/, MIND_AND_MOOD_SHELF)).toBe(true);
    expect(hasError(withIdeaBody(mood(), `Set a small goal for the week ahead. ${FILLER}`), /goal language/, MIND_AND_MOOD_SHELF)).toBe(true);
    expect(hasError(withIdeaBody(mood(), `Come back to this every day if you can. ${FILLER}`), /every day language/, MIND_AND_MOOD_SHELF)).toBe(true);
    // The same goal sentence on a tier none title on another shelf is allowed.
    expect(hasError(withIdeaBody(sample(), `Set a small goal for the week ahead. ${FILLER}`), /goal language/, "personal-growth")).toBe(false);
  });

  it("fails clinical words and signposts on a Mind and Mood title", () => {
    expect(hasError(withIdeaBody(mood(), `Saying no can stir up anxiety for some readers. ${FILLER}`), /clinical word/, MIND_AND_MOOD_SHELF)).toBe(true);
    expect(hasError(withIdeaBody(mood(), `If it gets hard, the Samaritans are there to listen. ${FILLER}`), /signpost/, MIND_AND_MOOD_SHELF)).toBe(true);
    expect(hasError(withIdeaBody(sample(), `More at https://example.com for later. ${FILLER}`), /link or number/)).toBe(true);
  });

  it("fails pressure wording on a title at the standard tier", () => {
    const d = withIdeaBody(mood(), `You need to say no to at least one request. ${FILLER}`);
    expect(hasError(d, /pressure wording/, "family-and-parenting")).toBe(true);
    expect(hasError({ ...sample(), units: d.units }, /pressure wording/, "personal-growth")).toBe(false);
  });

  it("leaves the catalogue title, book title and subtitle to the catalogue, but keeps the em dash ban", () => {
    const named = (title: string, subtitle: string): Doc => ({ ...sample(), title, book: { ...sample().book, title, subtitle } });
    expect(errors(named("The Sunday Morning Circle", "Cooking Simply for Yourself"), "personal-growth")).toEqual([]);
    expect(errors(named("A Newsletter People Look Forward To", "Free Notes"), "personal-growth")).toEqual([]);
    expect(hasError(named("A Polite No — Again", "Setting Limits"), /^title: .*em dash/i, "personal-growth")).toBe(true);
    expect(hasError(named("A Polite No", "Setting Limits — Kindly"), /^book\.subtitle: .*em dash/i, "personal-growth")).toBe(true);
    // The same words in reader copy are still caught.
    expect(hasError({ ...sample(), card_line: "Cook simply for yourself." }, /banned phrase/, "personal-growth")).toBe(true);
  });

  it("reads hyphenated -free compounds as a description, not a price", () => {
    for (const w of ["screen-free", "phone-free", "sugar-free"]) {
      expect(hasError({ ...sample(), card_line: `Plan a ${w} hour and keep it short.` }, /'free'/, "personal-growth")).toBe(false);
    }
    expect(hasError({ ...sample(), card_line: "A free workbook for a slow week." }, /'free' on a paid title/, "personal-growth")).toBe(true);
  });

  it("allows each day off Mind and Mood, in a card line and a body, and bans it on Mind and Mood", () => {
    const line = "Take one small step each day and write it down.";
    expect(hasError({ ...sample(), card_line: line }, /every day language/, "personal-growth")).toBe(false);
    expect(hasError(withIdeaBody(sample(), `Try one small no each day this week. ${FILLER}`), /each day/, "personal-growth")).toBe(false);
    expect(hasError({ ...mood(), card_line: line }, /every day language 'each day'/, MIND_AND_MOOD_SHELF)).toBe(true);
    expect(hasError(withIdeaBody(mood(), `Try one small no each day this week. ${FILLER}`), /every day language/, MIND_AND_MOOD_SHELF)).toBe(true);
  });
});

describe("demo profile: faith titles (31 October 2026)", () => {
  const FAITH = "faith-and-spirituality";
  /** The sample on the faith shelf, with its quoted reader lines unquoted so only the line under test is checked. */
  const faith = (tier: "none" | "standard" = "none"): Doc => {
    const d: Doc = { ...sample(), safety_tier: tier, theme_id: "rhythms-of-prayer" };
    for (const u of d.units) for (const i of u.ideas) i.body = i.body.replace(/"/g, "");
    return d;
  };
  const line = (d: Doc, l: string) => withIdeaBody(d, `${l} ${FILLER}`);
  const ok = (l: string, tier: "none" | "standard" = "none") => expect(errors(line(faith(tier), l), FAITH).filter((m) => m.startsWith("units[].ideas[]") && !/I or We/.test(m))).toEqual([]);

  it("lets ordinary faith words through on both tiers", () => {
    for (const tier of ["none", "standard"] as const) {
      ok("God is with you in the kitchen as much as in church. Prayer can be a few words over the washing up.", tier);
      ok("The Holy Spirit, the Eucharist, the saints, the Psalms, sin, confession and mercy all belong here. Amen.", tier);
      ok("Say the Lord's Prayer, then pray for one person by name in your own words.", tier);
      ok("Keep the Sabbath as a day of rest each week, and go to Mass or the Sunday service.", tier);
    }
  });

  it("accepts scripture by book and chapter, a gospel story told in the third person, and free will", () => {
    ok("Read Luke 15 slowly, then Luke chapter 15 again, and chapter 3 of John.");
    ok("Jesus heals a man in Mark 2 after his friends lower him through a roof.", "standard");
    ok("Christ sets us free, and free will is part of the gift.");
  });

  it("still fails scripture quoted beyond five words, a page citation, a healing promise and free misuse", () => {
    expect(hasError(line(faith(), 'Psalm 23 begins "The Lord is my shepherd, I shall not want" and goes on.'), /on a faith title/, FAITH)).toBe(true);
    expect(errors(line(faith(), 'Psalm 23 begins "The Lord is my shepherd" and goes on.'), FAITH).some((m) => /quoted/.test(m))).toBe(false);
    expect(hasError(line(faith(), "See page 12 of the parish booklet."), /citation/, FAITH)).toBe(true);
    expect(hasError(line(faith("standard"), "Prayer heals you over time."), /claim word/, FAITH)).toBe(true);
    expect(hasError(line(faith(), "The whole workbook is free to read."), /'free' on a paid title/, FAITH)).toBe(true);
    expect(hasError(line(faith(), "Pray when it suits you — morning or evening."), /em dash/, FAITH)).toBe(true);
  });
});
