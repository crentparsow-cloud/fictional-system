import { z } from "zod";

/**
 * The workbook builder form (build list 8.2). Pure: no Next and no Supabase,
 * so the page, the server action and the tests share one answer.
 *
 * The builder edits the part of a workbook that authors write: for each unit
 * its focus, intro, key ideas and takeaway, and for each exercise its title,
 * purpose, reason, minutes, steps, answer fields and "done when" line. It
 * starts from the latest version of a workbook that already exists. Everything
 * it does not show (safety lines, badge, the internal block, the toolkit,
 * milestones, the self-check and the rest) is carried over exactly as it was.
 *
 * What the builder allows is deliberately narrower than the JSON editor staff
 * use, because published ids must stay stable (readers' answers hang on them,
 * packages/validate stability.ts):
 *   - existing units keep their place and number; new units go on the end;
 *   - existing exercises and answer fields cannot be removed or have their
 *     id or type changed; only ones added in the builder can be taken away;
 *   - safety lines are never touched.
 * The save still goes through @akana/validate and the 0057 function, which
 * check again. Nothing here publishes: a saved draft goes through the same
 * sign-off and release gate as any other version.
 */

// ---------------------------------------------------------------------------
// The form model
// ---------------------------------------------------------------------------

export interface BuilderIdea {
  heading: string;
  body: string;
  example: string;
}

export interface BuilderField {
  /** The stored id. Blank for a field added in the builder until it is saved. */
  id: string;
  label: string;
  help: string;
  /** Any field type. A field added in the builder is short_text or long_text. */
  type: string;
  isNew: boolean;
}

export interface BuilderExercise {
  /** The stored exercise id, or null for an exercise added in the builder. */
  ref: string | null;
  title: string;
  purpose: string;
  why: string;
  minutes: number;
  steps: string[];
  fields: BuilderField[];
  doneWhen: string;
  chapter: string;
}

export interface BuilderUnit {
  /** The stored unit number, or null for a unit added in the builder. */
  ref: number | null;
  focus: string;
  intro: string;
  ideas: BuilderIdea[];
  takeaway: string;
  exercises: BuilderExercise[];
}

export interface BuilderModel {
  units: BuilderUnit[];
}

export const BUILDER_LIMITS = {
  units: 52,
  exercisesPerUnit: 3,
  ideasPerUnit: 10,
  stepsPerExercise: 10,
  fieldsPerExercise: 8,
  minutes: [1, 60] as [number, number],
  focus: 200,
  intro: 1200,
  heading: 200,
  body: 1200,
  example: 1200,
  takeaway: 400,
  title: 120,
  purpose: 300,
  why: 800,
  step: 300,
  label: 200,
  help: 300,
  doneWhen: 300,
  chapter: 120,
} as const;

export const NEW_FIELD_TYPES = ["short_text", "long_text"] as const;

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

// ---------------------------------------------------------------------------
// Reading a version into the form
// ---------------------------------------------------------------------------

/** Builds the form from a version's content. Units without a readable shape are skipped. */
export function modelFromContent(content: unknown): BuilderModel {
  if (!isObj(content)) return { units: [] };
  const exercises = new Map<string, Json>();
  for (const e of arr(content.exercises)) if (isObj(e) && typeof e.id === "string") exercises.set(e.id, e);

  const units: BuilderUnit[] = [];
  for (const u of arr(content.units)) {
    if (!isObj(u) || typeof u.number !== "number") continue;
    const exs: BuilderExercise[] = [];
    for (const id of arr(u.exercise_ids)) {
      const e = typeof id === "string" ? exercises.get(id) : undefined;
      if (!e) continue;
      exs.push({
        ref: String(e.id),
        title: str(e.title),
        purpose: str(e.purpose),
        why: str(e.why),
        minutes: typeof e.minutes === "number" ? e.minutes : 10,
        steps: arr(e.steps).map((s) => (isObj(s) ? str(s.text) : "")),
        fields: arr(e.fields)
          .filter(isObj)
          .map((f) => ({ id: str(f.id), label: str(f.label), help: str(f.help), type: str(f.type) || "short_text", isNew: false })),
        doneWhen: str(e.done_when),
        chapter: isObj(e.source) ? str(e.source.chapter) : "",
      });
    }
    units.push({
      ref: u.number,
      focus: str(u.focus),
      intro: str(u.intro),
      ideas: arr(u.ideas)
        .filter(isObj)
        .map((i) => ({ heading: str(i.heading), body: str(i.body), example: str(i.example) })),
      takeaway: str(u.takeaway),
      exercises: exs,
    });
  }
  return { units };
}

// ---------------------------------------------------------------------------
// Parsing what the browser sends
// ---------------------------------------------------------------------------

const ideaSchema = z.object({
  heading: z.string().max(BUILDER_LIMITS.heading),
  body: z.string().max(BUILDER_LIMITS.body),
  example: z.string().max(BUILDER_LIMITS.example),
});
const fieldSchema = z.object({
  id: z.string().max(60),
  label: z.string().max(BUILDER_LIMITS.label),
  help: z.string().max(BUILDER_LIMITS.help),
  type: z.string().max(40),
  isNew: z.boolean(),
});
const exerciseSchema = z.object({
  ref: z.string().max(80).nullable(),
  title: z.string().max(BUILDER_LIMITS.title),
  purpose: z.string().max(BUILDER_LIMITS.purpose),
  why: z.string().max(BUILDER_LIMITS.why),
  minutes: z.number().int().min(BUILDER_LIMITS.minutes[0]).max(BUILDER_LIMITS.minutes[1]),
  steps: z.array(z.string().max(BUILDER_LIMITS.step)).max(BUILDER_LIMITS.stepsPerExercise),
  fields: z.array(fieldSchema).max(BUILDER_LIMITS.fieldsPerExercise),
  doneWhen: z.string().max(BUILDER_LIMITS.doneWhen),
  chapter: z.string().max(BUILDER_LIMITS.chapter),
});
const unitSchema = z.object({
  ref: z.number().int().min(1).nullable(),
  focus: z.string().max(BUILDER_LIMITS.focus),
  intro: z.string().max(BUILDER_LIMITS.intro),
  ideas: z.array(ideaSchema).max(BUILDER_LIMITS.ideasPerUnit),
  takeaway: z.string().max(BUILDER_LIMITS.takeaway),
  exercises: z.array(exerciseSchema).max(BUILDER_LIMITS.exercisesPerUnit),
});
const modelSchema = z.object({ units: z.array(unitSchema).min(1).max(BUILDER_LIMITS.units) });

export const BUILDER_MAX_BYTES = 600_000;

export type ParsedModel = { ok: true; model: BuilderModel } | { ok: false; message: string };

/** Reads the JSON the form posts. Refuses anything that is not the model's shape or is too big. */
export function parseBuilderModel(text: unknown): ParsedModel {
  if (typeof text !== "string" || !text.trim()) return { ok: false, message: "The form sent nothing." };
  if (new TextEncoder().encode(text).length > BUILDER_MAX_BYTES) return { ok: false, message: "The form is bigger than the builder takes." };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, message: "The form could not be read." };
  }
  const r = modelSchema.safeParse(raw);
  if (!r.success) {
    const issue = r.error.issues[0];
    const where = issue ? issue.path.join(".") : "";
    return { ok: false, message: `Something in the form is too long or the wrong shape${where ? ` (${where})` : ""}.` };
  }
  return { ok: true, model: r.data };
}

// ---------------------------------------------------------------------------
// Friendly checks before the validator
// ---------------------------------------------------------------------------

export interface BuilderIssue {
  /** Where, in the author's words: "Week 3, exercise 1". */
  where: string;
  message: string;
}

function unitLabel(kind: string, n: number): string {
  const word = kind === "day" || kind === "module" || kind === "chapter" || kind === "part" ? kind : "week";
  return `${word.charAt(0).toUpperCase()}${word.slice(1)} ${n}`;
}

const blank = (s: string) => s.trim() === "";

/**
 * Checks the model against the version it started from. Returns the plain
 * problems an author can fix in the form. The validator runs after this and
 * covers house style, claims and counts.
 */
export function checkBuilderModel(model: BuilderModel, base: unknown): BuilderIssue[] {
  const issues: BuilderIssue[] = [];
  const baseModel = modelFromContent(base);
  const kind = isObj(base) && isObj(base.structure) ? str(base.structure.unit) : "week";
  const baseExercises = new Map<string, BuilderExercise>();
  for (const u of baseModel.units) for (const e of u.exercises) baseExercises.set(e.ref as string, e);
  const baseUnitCount = baseModel.units.length;

  // Existing units stay where they are; new ones follow.
  let seenNew = false;
  let kept = 0;
  model.units.forEach((u, i) => {
    const n = i + 1;
    const where = unitLabel(kind, n);
    if (u.ref === null) {
      seenNew = true;
    } else {
      kept += 1;
      if (seenNew || u.ref !== n) issues.push({ where, message: "Existing units keep their order. Add new ones after the last." });
    }
    if (blank(u.focus)) issues.push({ where, message: "Say what this unit is about in one sentence." });
    if (u.exercises.length < 1) issues.push({ where, message: "A unit needs at least one exercise." });
    u.ideas.forEach((idea, k) => {
      const parts = [idea.heading, idea.body, idea.example].filter((p) => !blank(p)).length;
      if (parts > 0 && parts < 3) issues.push({ where: `${where}, key idea ${k + 1}`, message: "Fill in the heading, the explanation and the example, or clear all three." });
    });
    u.exercises.forEach((e, k) => {
      const ew = `${where}, exercise ${k + 1}`;
      if (blank(e.title)) issues.push({ where: ew, message: "Give the exercise a short title." });
      if (blank(e.purpose)) issues.push({ where: ew, message: "Say what the exercise is for." });
      if (blank(e.why)) issues.push({ where: ew, message: "Say why it helps." });
      if (blank(e.doneWhen)) issues.push({ where: ew, message: "Say when the reader can call it done." });
      if (blank(e.chapter)) issues.push({ where: ew, message: "Name the chapter of the book it comes from." });
      if (e.steps.length < 1 || e.steps.some(blank)) issues.push({ where: ew, message: "Every step needs words. Remove empty steps and keep at least one." });
      if (e.fields.length < 1) issues.push({ where: ew, message: "Add at least one answer field." });
      if (e.fields.some((f) => blank(f.label))) issues.push({ where: ew, message: "Every answer field needs a label." });
      if (e.ref !== null) {
        const orig = baseExercises.get(e.ref);
        if (!orig) {
          issues.push({ where: ew, message: "This exercise is not in the version you started from." });
        } else {
          const wanted = new Set(orig.fields.map((f) => f.id));
          const have = new Set(e.fields.filter((f) => !f.isNew).map((f) => f.id));
          for (const id of wanted) if (!have.has(id)) issues.push({ where: ew, message: "An answer field that readers may already have used cannot be removed." });
          for (const f of e.fields) {
            const o = orig.fields.find((x) => x.id === f.id);
            if (!f.isNew && o && o.type !== f.type) issues.push({ where: ew, message: "An answer field keeps its type once it exists." });
          }
        }
      }
    });
  });
  if (kept < baseUnitCount) issues.push({ where: "Units", message: "Existing units cannot be removed. Only units you added in this form can be taken away." });

  const seenEx = new Set<string>();
  for (const u of model.units)
    for (const e of u.exercises)
      if (e.ref !== null) {
        if (seenEx.has(e.ref)) issues.push({ where: "Exercises", message: "An exercise can sit in one unit only." });
        seenEx.add(e.ref);
      }
  for (const id of baseExercises.keys()) {
    if (!seenEx.has(id)) {
      issues.push({ where: "Exercises", message: "An existing exercise was taken out of its unit. Only exercises you added in this form can be taken away." });
      break;
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Writing the form back into a version
// ---------------------------------------------------------------------------

function idSet(content: Json): Set<string> {
  const used = new Set<string>();
  for (const key of ["exercises", "toolkit", "milestones"]) for (const e of arr(content[key])) if (isObj(e) && typeof e.id === "string") used.add(e.id);
  return used;
}

/** A fresh exercise id, such as ex_u4_1. Never one already used in the document. */
export function newExerciseId(used: Set<string>, unitNumber: number): string {
  let k = 1;
  while (used.has(`ex_u${unitNumber}_${k}`)) k += 1;
  const id = `ex_u${unitNumber}_${k}`;
  used.add(id);
  return id;
}

/** A fresh answer field id, such as answer_1, unique inside one exercise. */
export function newFieldId(taken: Set<string>): string {
  let k = 1;
  while (taken.has(`answer_${k}`)) k += 1;
  const id = `answer_${k}`;
  taken.add(id);
  return id;
}

function setOrDelete(o: Json, key: string, value: string | undefined): void {
  if (value === undefined || value.trim() === "") delete o[key];
  else o[key] = value.trim();
}

/**
 * Applies the form to the version it started from and returns the new
 * content. The base is not changed. Call checkBuilderModel first; this does
 * what it is told and leaves the rest to the validator.
 */
export function applyBuilderModel(base: Record<string, unknown>, model: BuilderModel): Record<string, unknown> {
  const out = structuredClone(base) as Json;
  const origUnits = new Map<number, Json>();
  for (const u of arr(out.units)) if (isObj(u) && typeof u.number === "number") origUnits.set(u.number, u);
  const origExercises = new Map<string, Json>();
  for (const e of arr(out.exercises)) if (isObj(e) && typeof e.id === "string") origExercises.set(e.id, e);
  const used = idSet(out);

  const touched = new Map<string, Json>();
  const added: Json[] = [];
  let usesUnitParts = false;

  const units = model.units.map((mu, i) => {
    const number = i + 1;
    const orig = mu.ref !== null ? origUnits.get(mu.ref) : undefined;
    const unit: Json = { ...(orig ?? {}) };
    unit.number = number;
    unit.focus = mu.focus.trim();

    const ids: string[] = [];
    for (const me of mu.exercises) {
      const origEx = me.ref !== null ? origExercises.get(me.ref) : undefined;
      const id = origEx ? (me.ref as string) : newExerciseId(used, number);
      ids.push(id);

      const origSteps = origEx ? arr(origEx.steps) : [];
      const steps = me.steps.map((text, k) => {
        const o = origSteps[k];
        return isObj(o) ? { ...o, text: text.trim() } : { text: text.trim() };
      });
      const taken = new Set(me.fields.filter((f) => f.id !== "").map((f) => f.id));
      const origFields = origEx ? arr(origEx.fields).filter(isObj) : [];
      const fields = me.fields.map((mf) => {
        const o = !mf.isNew ? origFields.find((x) => x.id === mf.id) : undefined;
        const f: Json = o ? { ...o } : { id: mf.id || newFieldId(taken), type: (NEW_FIELD_TYPES as readonly string[]).includes(mf.type) ? mf.type : "short_text" };
        f.label = mf.label.trim();
        setOrDelete(f, "help", mf.help);
        return f;
      });
      const ex: Json = { ...(origEx ?? {}) };
      ex.id = id;
      ex.title = me.title.trim();
      ex.purpose = me.purpose.trim();
      ex.why = me.why.trim();
      ex.minutes = me.minutes;
      ex.steps = steps;
      ex.fields = fields;
      ex.done_when = me.doneWhen.trim();
      ex.source = { ...(origEx && isObj(origEx.source) ? origEx.source : {}), chapter: me.chapter.trim() };
      if (origEx) touched.set(id, ex);
      else added.push(ex);
    }
    unit.exercise_ids = ids;

    setOrDelete(unit, "intro", mu.intro);
    setOrDelete(unit, "takeaway", mu.takeaway);
    const ideas = mu.ideas
      .filter((x) => !(x.heading.trim() === "" && x.body.trim() === "" && x.example.trim() === ""))
      .map((x) => ({ heading: x.heading.trim(), body: x.body.trim(), example: x.example.trim() }));
    if (ideas.length) unit.ideas = ideas;
    else delete unit.ideas;
    if (unit.intro !== undefined || unit.takeaway !== undefined || unit.ideas !== undefined) usesUnitParts = true;
    return unit;
  });

  out.units = units;
  out.exercises = [...arr(out.exercises).map((e) => (isObj(e) && typeof e.id === "string" && touched.has(e.id) ? touched.get(e.id) : e)), ...added];
  const structure: Json = isObj(out.structure) ? { ...out.structure } : {};
  structure.count = units.length;
  out.structure = structure;
  // Intro, ideas and takeaway arrived in schema 3.1.
  if (usesUnitParts && out.schema_version === "3.0") out.schema_version = "3.1";
  return out;
}

// ---------------------------------------------------------------------------
// Blank pieces for the form's add buttons
// ---------------------------------------------------------------------------

export function blankField(): BuilderField {
  return { id: "", label: "", help: "", type: "long_text", isNew: true };
}

export function blankExercise(): BuilderExercise {
  return { ref: null, title: "", purpose: "", why: "", minutes: 10, steps: [""], fields: [blankField()], doneWhen: "", chapter: "" };
}

export function blankUnit(): BuilderUnit {
  return { ref: null, focus: "", intro: "", ideas: [], takeaway: "", exercises: [blankExercise()] };
}

export function blankIdea(): BuilderIdea {
  return { heading: "", body: "", example: "" };
}

// ---------------------------------------------------------------------------
// Validator findings in the author's words
// ---------------------------------------------------------------------------

/**
 * Turns a validator path such as units[2].ideas[0].body into "Week 3, key idea
 * 1, body", and exercises[1].steps[0].text into "Exercise "Title", step 1,
 * text" when the content is given. Paths it does not know are returned as they
 * are.
 */
export function friendlyPath(path: string, unitKind = "week", content?: unknown): string {
  if (!path) return "The workbook";
  const exercises = isObj(content) ? arr(content.exercises) : [];
  return path
    .split(".")
    .map((p) => {
      const m = /^([a-z_]+)\[(\d+)\]$/.exec(p);
      if (!m) return p.replace(/_/g, " ");
      const index = Number(m[2]);
      const n = index + 1;
      switch (m[1]) {
        case "units":
          return unitLabel(unitKind, n);
        case "exercises": {
          const e = exercises[index];
          const title = isObj(e) ? str(e.title).trim() : "";
          return title ? `Exercise "${title}"` : `Exercise ${n}`;
        }
        case "ideas":
          return `key idea ${n}`;
        case "steps":
          return `step ${n}`;
        case "fields":
          return `field ${n}`;
        default:
          return `${(m[1] ?? "").replace(/_/g, " ")} ${n}`;
      }
    })
    .join(", ");
}
