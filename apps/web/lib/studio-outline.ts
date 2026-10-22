import { z } from "zod";
import { blankExercise, type BuilderUnit } from "@/lib/studio-builder";

/**
 * The outline generator (build list 14.31). Five questions in, a unit
 * skeleton out, for an author to edit before they open the builder. It is
 * deterministic: the same answers give the same outline. There is no model
 * and no call to anything outside the page. The wording is fixed templates
 * around the author's own ideas, which are used as the unit topics.
 *
 * Shape. The first unit looks at where the reader is now. The last brings
 * the work together and plans what comes next. The units between share the
 * author's main ideas, in the order given, as evenly as they can. When there
 * are more units than ideas, the extra units are practice units that return
 * to an idea. When there are more ideas than units, units take several.
 */

export const UNIT_KINDS = ["week", "day", "module", "chapter"] as const;
export type OutlineUnitKind = (typeof UNIT_KINDS)[number];

export const PACES = ["one", "two", "three"] as const;
export type OutlinePace = (typeof PACES)[number];

export const PACE_EXERCISES: Record<OutlinePace, number> = { one: 1, two: 2, three: 3 };
export const PACE_LABELS: Record<OutlinePace, string> = {
  one: "One exercise in each unit",
  two: "Two exercises in each unit",
  three: "Three exercises in each unit",
};

export const OUTLINE_LIMITS = { minUnits: 3, maxUnits: 52, maxIdeas: 40, outcome: 300, reader: 300, idea: 120 } as const;

/** The five questions. */
export interface OutlineAnswers {
  /** 1. What should a reader be able to do at the end? */
  outcome: string;
  /** 2. Who is it for? */
  reader: string;
  /** 3. How long is the programme: the unit and how many. */
  unitKind: OutlineUnitKind;
  unitCount: number;
  /** 4. The main ideas of the book, in order, one per line. */
  ideas: string[];
  /** 5. How much practice in each unit. */
  pace: OutlinePace;
}

export interface OutlineUnit {
  number: number;
  /** One sentence for the unit's focus line. */
  focus: string;
  /** The author's ideas this unit covers, as short phrases. */
  topics: string[];
  /** How many exercises to plan. */
  exercises: number;
  role: "start" | "idea" | "practice" | "close";
}

export interface Outline {
  unitKind: OutlineUnitKind;
  units: OutlineUnit[];
}

export const OUTLINE_QUESTIONS = [
  { key: "outcome", label: "What should a reader be able to do at the end?", hint: "One or two sentences. Start with a verb, such as \"plan\" or \"stop\"." },
  { key: "reader", label: "Who is it for?", hint: "The person you have in mind, in a sentence." },
  { key: "length", label: "How long is the programme?", hint: "Choose the unit and how many. Four to twelve is usual." },
  { key: "ideas", label: "What are the main ideas of the book, in order?", hint: "One idea on each line. Three to forty." },
  { key: "pace", label: "How much practice in each unit?", hint: "A reader has about fifteen minutes a unit." },
] as const;

// ---------------------------------------------------------------------------
// Reading the answers
// ---------------------------------------------------------------------------

function clean(s: string, max: number): string {
  return s.replace(/\s+/g, " ").trim().slice(0, max);
}

/** Splits a block of lines into ideas: trims, drops bullets and numbers, drops blanks and repeats. */
export function parseIdeas(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const idea = clean(line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, ""), OUTLINE_LIMITS.idea).replace(/[.;:,]+$/, "");
    const key = idea.toLowerCase();
    if (idea && !seen.has(key)) {
      seen.add(key);
      out.push(idea);
    }
  }
  return out.slice(0, OUTLINE_LIMITS.maxIdeas);
}

const answersSchema = z.object({
  outcome: z.string().transform((s) => clean(s, OUTLINE_LIMITS.outcome)).pipe(z.string().min(3, "Say what the reader will be able to do.")),
  reader: z.string().transform((s) => clean(s, OUTLINE_LIMITS.reader)).pipe(z.string().min(3, "Say who it is for.")),
  unitKind: z.enum(UNIT_KINDS, { errorMap: () => ({ message: "Choose week, day, module or chapter." }) }),
  unitCount: z.coerce.number().int().min(OUTLINE_LIMITS.minUnits, `Use at least ${OUTLINE_LIMITS.minUnits} units.`).max(OUTLINE_LIMITS.maxUnits, `Use ${OUTLINE_LIMITS.maxUnits} units or fewer.`),
  ideas: z.string().transform(parseIdeas).pipe(z.array(z.string()).min(3, "Give at least three ideas, one on each line.")),
  pace: z.enum(PACES, { errorMap: () => ({ message: "Choose how much practice." }) }),
});

export type OutlineField = "outcome" | "reader" | "length" | "ideas" | "pace";
export type ParsedAnswers = { ok: true; answers: OutlineAnswers } | { ok: false; errors: Partial<Record<OutlineField, string>> };

export function parseOutlineAnswers(raw: Record<string, unknown>): ParsedAnswers {
  const r = answersSchema.safeParse(raw);
  if (r.success) return { ok: true, answers: r.data };
  const errors: Partial<Record<OutlineField, string>> = {};
  for (const issue of r.error.issues) {
    const key = issue.path[0];
    const field: OutlineField = key === "unitKind" || key === "unitCount" ? "length" : (key as OutlineField);
    if (!errors[field]) errors[field] = issue.message;
  }
  return { ok: false, errors };
}

// ---------------------------------------------------------------------------
// The skeleton
// ---------------------------------------------------------------------------

function lowerFirst(s: string): string {
  return s.length > 1 && s.charAt(1) === s.charAt(1).toLowerCase() ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

function join(topics: readonly string[]): string {
  const t = topics.map(lowerFirst);
  if (t.length <= 1) return t[0] ?? "";
  if (t.length === 2) return `${t[0]} and ${t[1]}`;
  return `${t.slice(0, -1).join(", ")} and ${t[t.length - 1]}`;
}

/** Splits a list into `parts` runs in order, sizes as even as possible, earlier runs larger. */
export function splitEvenly<T>(items: readonly T[], parts: number): T[][] {
  const out: T[][] = [];
  const base = Math.floor(items.length / parts);
  const extra = items.length % parts;
  let at = 0;
  for (let i = 0; i < parts; i++) {
    const size = base + (i < extra ? 1 : 0);
    out.push(items.slice(at, at + size));
    at += size;
  }
  return out;
}

export function generateOutline(a: OutlineAnswers): Outline {
  const exercises = PACE_EXERCISES[a.pace];
  const count = Math.min(OUTLINE_LIMITS.maxUnits, Math.max(OUTLINE_LIMITS.minUnits, Math.round(a.unitCount)));
  const ideas = a.ideas.slice(0, OUTLINE_LIMITS.maxIdeas);
  const units: OutlineUnit[] = [];

  units.push({
    number: 1,
    focus: "See where you are now, and what you want to change.",
    topics: [],
    exercises,
    role: "start",
  });

  const middle = count - 2;
  if (ideas.length >= middle) {
    splitEvenly(ideas, middle).forEach((topics, i) => {
      units.push({
        number: i + 2,
        focus: `Work on ${join(topics)}.`,
        topics,
        exercises,
        role: "idea",
      });
    });
  } else {
    // More units than ideas: one idea each, then practice units that go back over them in order.
    for (let i = 0; i < middle; i++) {
      const idea = ideas[i % ideas.length] ?? "";
      const first = i < ideas.length;
      units.push({
        number: i + 2,
        focus: first ? `Work on ${lowerFirst(idea)}.` : `Practise ${lowerFirst(idea)} in your own week.`,
        topics: [idea],
        exercises,
        role: first ? "idea" : "practice",
      });
    }
  }

  units.push({
    number: count,
    focus: "Bring it together, and plan what comes next.",
    topics: [],
    exercises,
    role: "close",
  });
  return { unitKind: a.unitKind, units };
}

/** The outline as plain text, one unit to a line, for copying into a document. */
export function outlineToText(o: Outline, answers?: Pick<OutlineAnswers, "outcome" | "reader">): string {
  const word = o.unitKind.charAt(0).toUpperCase() + o.unitKind.slice(1);
  const lines: string[] = [];
  if (answers) {
    lines.push(`Outcome: ${answers.outcome}`, `For: ${answers.reader}`, "");
  }
  for (const u of o.units) {
    lines.push(`${word} ${u.number}: ${u.focus}`);
    if (u.topics.length) lines.push(`  Topics: ${u.topics.join("; ")}`);
    lines.push(`  Plan ${u.exercises} ${u.exercises === 1 ? "exercise" : "exercises"}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Hand-over to the builder
// ---------------------------------------------------------------------------

/** The outline's units as new, empty units for the builder to fill. */
export function outlineToBuilderUnits(o: Outline): BuilderUnit[] {
  return o.units.map((u) => ({
    ref: null,
    focus: u.focus,
    intro: "",
    ideas: [],
    takeaway: "",
    exercises: Array.from({ length: Math.max(1, Math.min(3, u.exercises)) }, () => blankExercise()),
  }));
}

/** The key the outline is kept under in this browser, so the builder can offer it. */
export const OUTLINE_STORAGE_KEY = "akana.studio.outline.v1";

const storedSchema = z.object({
  unitKind: z.enum(UNIT_KINDS),
  units: z
    .array(
      z.object({
        number: z.number().int().min(1),
        focus: z.string().max(300),
        topics: z.array(z.string().max(OUTLINE_LIMITS.idea)).max(OUTLINE_LIMITS.maxIdeas),
        exercises: z.number().int().min(1).max(3),
        role: z.enum(["start", "idea", "practice", "close"]),
      }),
    )
    .min(1)
    .max(OUTLINE_LIMITS.maxUnits),
});

/** Reads a stored outline, or null when it is missing or not the right shape. */
export function readStoredOutline(text: string | null | undefined): Outline | null {
  if (!text) return null;
  try {
    const r = storedSchema.safeParse(JSON.parse(text));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}
