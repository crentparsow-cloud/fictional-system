/**
 * The group leader kit (9.2): a talk outline and a discussion guide for each
 * unit, and printable welcome slides, all made from the published workbook.
 *
 * The only input is the workbook's own content (0061 org_group_kit_source).
 * Nothing here can reach a member's answer: the source has none, and the
 * discussion questions never ask anyone to read out what they wrote. Sharing
 * is always the member's choice, and the kit says so.
 */

export interface KitExercise {
  title: string;
  purpose: string;
  minutes: number;
  /** The first few step texts, so a leader can describe the task. */
  steps: string[];
}

export interface KitIdea {
  heading: string;
  body: string;
}

export interface KitUnit {
  number: number;
  focus: string;
  intro: string | null;
  ideas: KitIdea[];
  takeaway: string | null;
  exercises: KitExercise[];
}

export interface KitSource {
  title: string;
  faith: boolean;
  welcome: string | null;
  howItWorks: string[];
  units: KitUnit[];
}

const text = (v: unknown, max = 600): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function parseExercise(raw: unknown): KitExercise | null {
  const e = obj(raw);
  const title = text(e.title, 160);
  if (!title) return null;
  const minutes = typeof e.minutes === "number" && Number.isFinite(e.minutes) ? Math.min(60, Math.max(1, Math.round(e.minutes))) : 10;
  const steps = arr(e.steps)
    .map((s) => text(obj(s).text, 240))
    .filter((s): s is string => s !== null)
    .slice(0, 3);
  return { title, purpose: text(e.purpose, 300) ?? "", minutes, steps };
}

function parseUnit(raw: unknown, index: number): KitUnit | null {
  const u = obj(raw);
  const focus = text(u.focus, 300);
  if (!focus) return null;
  const number = typeof u.number === "number" && Number.isInteger(u.number) && u.number >= 1 ? u.number : index + 1;
  const ideas = arr(u.ideas)
    .map((i) => ({ heading: text(obj(i).heading, 200), body: text(obj(i).body, 500) }))
    .filter((i): i is KitIdea => i.heading !== null && i.body !== null)
    .slice(0, 10);
  return {
    number,
    focus,
    intro: text(u.intro, 700),
    ideas,
    takeaway: text(u.takeaway, 400),
    exercises: arr(u.exercises).map(parseExercise).filter((e): e is KitExercise => e !== null),
  };
}

/** Defensive read of the 0061 source. Null when there is no usable unit. */
export function parseKitSource(data: unknown): KitSource | null {
  const d = obj(data);
  const title = text(d.workbook_title, 200);
  if (!title) return null;
  const start = obj(obj(d.start).start);
  const units = arr(d.units)
    .map(parseUnit)
    .filter((u): u is KitUnit => u !== null)
    .sort((a, b) => a.number - b.number);
  if (units.length === 0) return null;
  return {
    title,
    faith: d.faith === true,
    welcome: text(start.welcome, 900),
    howItWorks: arr(start.how_it_works)
      .map((h) => text(h, 300))
      .filter((h): h is string => h !== null)
      .slice(0, 5),
    units,
  };
}

// ---------------------------------------------------------------------------
// Talk outline
// ---------------------------------------------------------------------------

export interface OutlineBlock {
  heading: string;
  minutes: number;
  points: string[];
}

export interface TalkOutline {
  unit: number;
  focus: string;
  totalMinutes: number;
  blocks: OutlineBlock[];
}

/** A short talk: welcome, the unit's ideas, what members do, and a close. The leader's own words fill the gaps. */
export function talkOutline(unit: KitUnit): TalkOutline {
  const blocks: OutlineBlock[] = [];
  blocks.push({
    heading: "Welcome",
    minutes: 5,
    points: ["Welcome people back and remind them that sharing is always optional.", `This week is about: ${unit.focus}`, ...(unit.intro ? [unit.intro] : [])],
  });
  if (unit.ideas.length > 0) {
    blocks.push({
      heading: "The ideas",
      minutes: Math.min(20, Math.max(5, unit.ideas.length * 4)),
      points: unit.ideas.map((i) => `${i.heading}. ${i.body}`),
    });
  }
  if (unit.exercises.length > 0) {
    blocks.push({
      heading: "What people do this week",
      minutes: 5,
      points: unit.exercises.map((e) => `${e.title}, about ${e.minutes} minutes.${e.purpose ? ` ${e.purpose}` : ""}`),
    });
  }
  blocks.push({
    heading: "Close",
    minutes: 3,
    points: [...(unit.takeaway ? [unit.takeaway] : []), "Remind people that Help now in the Akana app lists free support lines, and that they can stop at any time."],
  });
  return { unit: unit.number, focus: unit.focus, totalMinutes: blocks.reduce((n, b) => n + b.minutes, 0), blocks };
}

// ---------------------------------------------------------------------------
// Discussion guide
// ---------------------------------------------------------------------------

export interface DiscussionGuide {
  unit: number;
  intro: string;
  questions: string[];
}

export const DISCUSSION_RULE =
  "Nobody has to share anything they wrote. Ask the questions as they are. If someone starts to read out an answer, thank them and move on.";

/**
 * Questions about the ideas and the experience of doing the task. None asks for
 * a member's answer, and none asks how often anyone did it.
 */
export function discussionGuide(unit: KitUnit): DiscussionGuide {
  const questions: string[] = [];
  questions.push("What stood out for you this week? Say as much or as little as you like.");
  for (const idea of unit.ideas.slice(0, 3)) {
    questions.push(`The idea "${idea.heading}": where do you see it in everyday life, in general terms?`);
  }
  for (const ex of unit.exercises.slice(0, 2)) {
    questions.push(`Without saying what you wrote, what was it like to do "${ex.title}"?`);
  }
  questions.push("What would make this easier to try next week?");
  if (unit.takeaway) questions.push("What does the takeaway mean to you? Do you agree with it?");
  return { unit: unit.number, intro: DISCUSSION_RULE, questions };
}

// ---------------------------------------------------------------------------
// Welcome slides
// ---------------------------------------------------------------------------

export interface Slide {
  title: string;
  lines: string[];
}

export const GROUND_RULES = [
  "Taking part is your choice. Share only what you want to.",
  "What anyone says here stays here.",
  "Listen to each other. Do not give advice unless someone asks.",
  "You can leave the room or stop at any time.",
] as const;

/** Printable welcome slides. They hold no names, no counts and nothing a member wrote. */
export function welcomeSlides(source: KitSource, groupName?: string): Slide[] {
  const slides: Slide[] = [];
  slides.push({
    title: groupName ? `Welcome to ${groupName}` : "Welcome",
    lines: [source.title, ...(source.welcome ? [source.welcome] : [])],
  });
  slides.push({
    title: "How it works",
    lines:
      source.howItWorks.length > 0
        ? source.howItWorks
        : ["Each person reads a week at a time and does the exercises on their own.", "We meet to talk about the ideas."],
  });
  slides.push({
    title: "Your answers are private",
    lines: ["What you write in the workbook is yours.", "Your leader cannot see it. Nor can your organisation.", "You choose whether to share any of it when we meet."],
  });
  slides.push({ title: "Ground rules", lines: [...GROUND_RULES] });
  slides.push({
    title: "The weeks ahead",
    lines: source.units.map((u) => `Week ${u.number}: ${u.focus}`),
  });
  slides.push({
    title: "If you need support",
    lines: ["Help now in the Akana app lists free support lines.", "You can stop at any time, and talk to the leader after the session if you want to."],
  });
  return slides;
}
