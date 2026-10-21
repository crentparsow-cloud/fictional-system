import { describe, expect, it } from "vitest";
import { WorkbookV3, type WorkbookV3Input } from "@akana/schema";
import { unitReadingMinutes, unitReadingWords, validateWorkbook } from "./index";

const filler = (n: number) => Array(n).fill("word").join(" ");
const idea = (over: Record<string, string> = {}) => ({
  heading: "A good life starts as a list of debts",
  body: `Marcus names those who taught him. ${filler(25)}. Each entry is one thing learned.`,
  example: `"From my grandfather I learned good morals." ${filler(10)}`,
  ...over,
});

function classic(unit: Record<string, unknown>, over: Partial<WorkbookV3Input> = {}): WorkbookV3Input {
  return {
    schema_version: "3.1",
    code: "AK-FN9KB",
    slug: "meditations-fn9kb",
    title: "Meditations",
    card_line: "One book of the Meditations each week.",
    book: { book_id: "meditations", title: "Meditations" },
    author: { author_id: "AU-M0SAD", display_name: "Marcus Aurelius" },
    genre: "personal_development",
    language: "en",
    spelling: "en-GB",
    is_demo: false,
    depth: "first_unit",
    badge: "public_domain",
    safety_tier: "none",
    structure: { unit: "week", count: 1, free_units: 1 },
    start: { welcome: "A week at a time.", how_it_works: ["Read.", "Answer."], why_prompt: "Why this book?" },
    units: [{ number: 1, focus: "Marcus begins by naming everyone who taught him", exercise_ids: ["debts"], ...unit }],
    exercises: [
      {
        id: "debts",
        title: "List the people who shaped you",
        purpose: "A short list of people.",
        why: "Book 1 is a list of thanks. Yours will do the same work.",
        source: { chapter: "Book 1" },
        minutes: 8,
        steps: [{ text: "Think of three people." }, { text: "Write one line each." }],
        fields: [{ id: "people", type: "short_text", label: "Who taught you, and what do you still use?" }],
        done_when: "Three people are named.",
      },
    ],
    finish: { summary: "Done.", book_bridge: "Read the book." },
    ...over,
  };
}

const ideas = (n: number) => Array.from({ length: n }, (_, i) => idea({ heading: `Idea number ${i + 1} is a claim you could dispute` }));
const msgs = (r: ReturnType<typeof validateWorkbook>) => [...r.errors, ...r.warnings].map((f) => `${f.path}: ${f.message}`);

describe("schema 3.1 unit parts", () => {
  it("passes a complete unit with no unit-part findings", () => {
    const r = validateWorkbook(classic({ intro: "Book 1 is a list of thanks. Marcus wrote down what he owed.", ideas: ideas(5), takeaway: "Three people are named." }), { lenient: true });
    expect(r.errors).toEqual([]);
    expect(msgs(r).filter((m) => m.startsWith("units["))).toEqual(expect.not.arrayContaining([expect.stringContaining("key ideas")]));
  });

  it("leaves a 3.0 file alone: no new findings, and the 3.0 version still parses", () => {
    const r = validateWorkbook(classic({}, { schema_version: "3.0" }), { lenient: true });
    expect(r.ok).toBe(true);
    expect(msgs(r).some((m) => m.includes("key idea"))).toBe(false);
  });

  it("needs five to ten ideas", () => {
    expect(validateWorkbook(classic({ ideas: ideas(4) }), { lenient: true }).errors.map((e) => e.message)).toContain("4 key ideas, need 5 to 10");
    expect(validateWorkbook(classic({ ideas: ideas(10) }), { lenient: true }).errors.some((e) => e.message.includes("key ideas, need"))).toBe(false);
  });

  it("flags a heading under five words and an idea over 120 words", () => {
    const r = validateWorkbook(classic({ ideas: [idea({ heading: "Gratitude" }), ...ideas(4), idea({ body: filler(130) })] }), { lenient: true });
    const m = r.errors.map((e) => `${e.path}: ${e.message}`);
    expect(m.some((x) => x.includes("ideas[0].heading") && x.includes("full sentence"))).toBe(true);
    expect(m.some((x) => x.includes("ideas[5]") && x.includes("limit 120"))).toBe(true);
  });

  it("enforces the new field word limits", () => {
    const r = validateWorkbook(classic({ intro: filler(95), takeaway: filler(45), ideas: ideas(5) }), { lenient: true });
    const paths = r.errors.filter((e) => e.category === "limit").map((e) => e.path);
    expect(paths).toContain("units[].intro");
    expect(paths).toContain("units[].takeaway");
  });

  it("requires the exercise question to be a question", () => {
    const base = classic({ ideas: ideas(5), intro: "One. Two.", takeaway: "Done." });
    const bad = { ...base, exercises: [{ ...base.exercises[0]!, fields: [{ id: "people", type: "short_text" as const, label: "Reflect on your lessons" }] }] };
    expect(validateWorkbook(bad, { lenient: true }).errors.some((e) => e.message.includes("must be a question"))).toBe(true);
  });

  it("works reading time out from word count at 200 words a minute", () => {
    const parsed = WorkbookV3.parse(classic({ intro: filler(400), ideas: [], takeaway: filler(400) }));
    const u = parsed.units[0]!;
    expect(unitReadingWords(u)).toBe(800);
    expect(unitReadingMinutes(u)).toBe(4);
    expect(unitReadingMinutes({ ...u, intro: undefined, takeaway: undefined })).toBe(0);
  });

  it("warns when reading plus exercises is far from fifteen minutes", () => {
    const base = classic({ intro: "One. Two.", ideas: ideas(5), takeaway: "Done." });
    const short = { ...base, exercises: [{ ...base.exercises[0]!, minutes: 2 }] };
    const r = validateWorkbook(short, { lenient: true });
    expect(r.warnings.some((w) => w.message.includes("spec asks for about 15"))).toBe(true);
  });
});
