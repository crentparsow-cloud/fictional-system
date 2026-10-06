import { canonicalJson, type WorkbookV3 } from "@akana/schema";

/**
 * Id stability between two versions of one workbook (F-110).
 *
 * Readers' answers attach to stable ids. Once a version is live, an id may
 * never be removed or reused for something else. New ids may be added.
 * A change to any safety line means safety sign-off must be done again.
 *
 * Compare the last live (or last committed) version as `previous` with the
 * candidate as `next`.
 */

export type StabilityCode =
  | "CODE_CHANGED"
  | "EXERCISE_REMOVED"
  | "FIELD_REMOVED"
  | "FIELD_TYPE_CHANGED"
  | "CHECKIN_FIELD_REMOVED"
  | "UNIT_REMOVED"
  | "TOOLKIT_REMOVED"
  | "MILESTONE_REMOVED"
  | "ID_REUSED"
  | "SAFETY_CHANGED";

export type IdKind = "exercise" | "toolkit" | "milestone";

export interface StabilityFinding {
  code: StabilityCode;
  /** Where the id lived in `previous`, e.g. exercises[e04].fields[f2]. */
  path: string;
  message: string;
}

/** Safety lines. A change to any of these resets safety sign-off. */
const SAFETY_LINES: { path: string; get: (doc: WorkbookV3) => unknown }[] = [
  { path: "safety_tier", get: (d) => d.safety_tier },
  { path: "advice_guardrail", get: (d) => d.advice_guardrail },
  { path: "start.higher_tier_note", get: (d) => d.start.higher_tier_note },
  { path: "start.extra_safety_note", get: (d) => d.start.extra_safety_note },
  { path: "safety_hub", get: (d) => d.safety_hub },
];

function kindsById(doc: WorkbookV3): Map<string, IdKind> {
  const out = new Map<string, IdKind>();
  for (const e of doc.exercises) out.set(e.id, "exercise");
  for (const t of doc.toolkit ?? []) out.set(t.id, "toolkit");
  for (const m of doc.milestones ?? []) out.set(m.id, "milestone");
  return out;
}

function same(a: unknown, b: unknown): boolean {
  return canonicalJson(a ?? null) === canonicalJson(b ?? null);
}

export function checkIdStability(previous: WorkbookV3, next: WorkbookV3): StabilityFinding[] {
  const out: StabilityFinding[] = [];
  const add = (code: StabilityCode, path: string, message: string) => out.push({ code, path, message });

  if (previous.code !== next.code) {
    add("CODE_CHANGED", "code", `workbook code changed from ${previous.code} to ${next.code}; codes are permanent`);
  }

  // Exercises and their fields.
  const nextExercises = new Map(next.exercises.map((e) => [e.id, e]));
  for (const e of previous.exercises) {
    const n = nextExercises.get(e.id);
    if (!n) {
      add("EXERCISE_REMOVED", `exercises[${e.id}]`, `exercise ${e.id} is missing; answers attach to it`);
      continue;
    }
    const nextFields = new Map(n.fields.map((f) => [f.id, f]));
    for (const f of e.fields) {
      const nf = nextFields.get(f.id);
      if (!nf) {
        add("FIELD_REMOVED", `exercises[${e.id}].fields[${f.id}]`, `field ${e.id}.${f.id} is missing; answers attach to it`);
      } else if (nf.type !== f.type) {
        add(
          "FIELD_TYPE_CHANGED",
          `exercises[${e.id}].fields[${f.id}]`,
          `field ${e.id}.${f.id} changed type from ${f.type} to ${nf.type}; saved answers would no longer fit`,
        );
      }
    }
  }

  // Check-in fields also hold answers.
  const nextCheckin = new Map((next.checkin?.fields ?? []).map((f) => [f.id, f]));
  for (const f of previous.checkin?.fields ?? []) {
    const nf = nextCheckin.get(f.id);
    if (!nf) {
      add("CHECKIN_FIELD_REMOVED", `checkin.fields[${f.id}]`, `check-in field ${f.id} is missing; answers attach to it`);
    } else if (nf.type !== f.type) {
      add("FIELD_TYPE_CHANGED", `checkin.fields[${f.id}]`, `check-in field ${f.id} changed type from ${f.type} to ${nf.type}`);
    }
  }

  // Units.
  const nextUnits = new Set(next.units.map((u) => u.number));
  for (const u of previous.units) {
    if (!nextUnits.has(u.number)) add("UNIT_REMOVED", `units[${u.number}]`, `unit ${u.number} is missing`);
  }

  // Toolkit cards and milestones.
  const nextToolkit = new Set((next.toolkit ?? []).map((t) => t.id));
  for (const t of previous.toolkit ?? []) {
    if (!nextToolkit.has(t.id)) add("TOOLKIT_REMOVED", `toolkit[${t.id}]`, `toolkit card ${t.id} is missing`);
  }
  const nextMilestones = new Set((next.milestones ?? []).map((m) => m.id));
  for (const m of previous.milestones ?? []) {
    if (!nextMilestones.has(m.id)) add("MILESTONE_REMOVED", `milestones[${m.id}]`, `milestone ${m.id} is missing`);
  }

  // An id that named one kind of thing must not name another kind now.
  const before = kindsById(previous);
  const after = kindsById(next);
  for (const [id, kind] of before) {
    const now = after.get(id);
    if (now && now !== kind) {
      add("ID_REUSED", id, `id ${id} was a ${kind} and now names a ${now}; ids are never reused`);
    }
  }

  // Safety lines.
  for (const line of SAFETY_LINES) {
    if (!same(line.get(previous), line.get(next))) {
      add("SAFETY_CHANGED", line.path, `${line.path} changed; safety sign-off must be redone before this version goes live`);
    }
  }

  return out;
}

export function formatStabilityFindings(label: string, findings: StabilityFinding[]): string {
  if (findings.length === 0) return `${label}: ids stable`;
  return [`${label}: ${findings.length} finding(s)`, ...findings.map((f) => `  ${f.code}  ${f.path}  ${f.message}`)].join("\n");
}
