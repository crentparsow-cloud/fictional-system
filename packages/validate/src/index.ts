import { WorkbookV3, type WorkbookV3 as Workbook } from "@akana/schema";
import {
  BANNED_CHARS,
  BANNED_PHRASES,
  BREATH_RE,
  CLAIM_ALLOW,
  CONTRACTION_RE,
  EMOJI,
  HOLD_OPTOUT_RE,
  HOLD_RE,
  LIMITS,
  NON_READER_KEYS,
  NOT_IS_RE,
  SAFETY_KEYS,
  SAFETY_WORDS_RE,
  SPELLING_PAIRS,
  claimPatterns,
  genreProfile,
} from "./rules";

export * from "./rules";
export * from "./stability";

export type Severity = "error" | "warning";
export type Category = "schema" | "style" | "claims" | "limit" | "refs" | "count" | "safety" | "depth";

export interface Finding {
  severity: Severity;
  category: Category;
  path: string;
  message: string;
  excerpt?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: Finding[];
  warnings: Finding[];
  doc?: Workbook;
}

export interface ValidateOptions {
  /** Template or pilot content: count and depth gaps become warnings. */
  lenient?: boolean;
  /** Skip the claims check for listing copy drafts. Default false. */
  skipClaims?: boolean;
}

// ---------- helpers ----------

function* walk(node: unknown, path = ""): Generator<[string, string]> {
  if (typeof node === "string") {
    yield [path, node];
  } else if (Array.isArray(node)) {
    for (const v of node) yield* walk(v, `${path}[]`);
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) yield* walk(v, path ? `${path}.${k}` : k);
  }
}

function pathParts(path: string): string[] {
  return path.split(/[.[\]]+/).filter(Boolean);
}

function isReaderCopy(path: string): boolean {
  return !pathParts(path).some((p) => NON_READER_KEYS.has(p));
}

export function words(s: string): number {
  return (s.match(/[A-Za-z0-9']+/g) ?? []).length;
}

function excerpt(s: string, n = 70): string {
  return s.length > n ? s.slice(0, n) + "..." : s;
}

const BANNED_RE = BANNED_PHRASES.map((p) => new RegExp(p, "gi"));

// ---------- checks ----------

function checkStyle(doc: Workbook, out: Finding[], opts: ValidateOptions): void {
  const claimRe = claimPatterns(doc.genre, doc.safety_tier);
  const wantGb = doc.spelling === "en-GB";
  const spellingRe = SPELLING_PAIRS.map(([us, gb]) => {
    const wrong = wantGb ? us : gb;
    const right = wantGb ? gb : us;
    const soft = wrong === "practice" || wrong === "practise";
    return { re: new RegExp(String.raw`\b${wrong}\b`, "gi"), right, soft };
  });

  let notIsHits = 0;
  for (const [path, s] of walk(doc)) {
    if (!isReaderCopy(path)) continue;

    for (const [ch, name] of Object.entries(BANNED_CHARS)) {
      if (s.includes(ch)) out.push({ severity: "error", category: "style", path, message: `${name} in text`, excerpt: excerpt(s) });
    }
    if (EMOJI.test(s)) out.push({ severity: "error", category: "style", path, message: "emoji in text" });
    if (s.includes("!")) out.push({ severity: "error", category: "style", path, message: "exclamation mark" });

    // Quoted speech is exempt: characters may say "I".
    const dequoted = s.replace(/"[^"]*"/g, '"q"');
    for (const sentence of dequoted.split(/(?<=[.!?])\s+/)) {
      if (/^(I|We)\b/.test(sentence.trim())) {
        out.push({ severity: "error", category: "style", path, message: "sentence starts with I or We", excerpt: excerpt(sentence, 50) });
      }
    }

    if (!opts.skipClaims) {
      const cleaned = s.replace(CLAIM_ALLOW, "");
      for (const m of cleaned.matchAll(claimRe)) {
        out.push({ severity: "error", category: "claims", path, message: `claim word '${m[0]}'`, excerpt: excerpt(s) });
      }
    }

    for (const { re, right, soft } of spellingRe) {
      for (const m of s.matchAll(re)) {
        out.push({
          severity: soft ? "warning" : "error",
          category: "style",
          path,
          message: `spelling '${m[0]}' does not match ${doc.spelling} (use ${right})`,
        });
      }
    }

    for (const re of BANNED_RE) {
      for (const m of s.matchAll(re)) {
        out.push({ severity: "error", category: "style", path, message: `banned phrase '${m[0]}'`, excerpt: excerpt(s, 60) });
      }
    }

    for (const sentence of s.split(/(?<=[.!?])\s+/)) {
      if (BREATH_RE.test(sentence) && !/\bcount/i.test(sentence)) {
        out.push({ severity: "error", category: "style", path, message: "breath count without a unit ('count to four')", excerpt: excerpt(sentence, 60) });
      }
    }
    if (HOLD_RE.test(s) && !HOLD_OPTOUT_RE.test(s)) {
      out.push({ severity: "error", category: "style", path, message: "breath hold without an opt-out", excerpt: excerpt(s, 60) });
    }

    const parts = new Set(pathParts(path));
    const isSafetyText = [...parts].some((p) => SAFETY_KEYS.has(p)) || SAFETY_WORDS_RE.test(s);
    if (isSafetyText) {
      for (const m of s.matchAll(CONTRACTION_RE)) {
        out.push({ severity: "error", category: "style", path, message: `contraction '${m[0]}' in safety, crisis or consent text`, excerpt: excerpt(s, 60) });
      }
    }

    if (NOT_IS_RE.test(s)) notIsHits++;
  }
  if (notIsHits > 1) {
    out.push({ severity: "error", category: "style", path: "", message: `'is not X. It is Y.' used ${notIsHits} times, at most once per workbook` });
  }
}

function checkLimits(doc: Workbook, out: Finding[]): void {
  for (const [path, s] of walk(doc)) {
    const limit = LIMITS[path];
    if (limit !== undefined && words(s) > limit) {
      out.push({ severity: "error", category: "limit", path, message: `${words(s)} words, limit ${limit}`, excerpt: excerpt(s, 60) });
    }
  }
}

function dupes(ids: string[]): string[] {
  const seen = new Set<string>();
  const d = new Set<string>();
  for (const i of ids) (seen.has(i) ? d : seen).add(i);
  return [...d].sort();
}

function checkRefs(doc: Workbook, out: Finding[]): void {
  const err = (path: string, message: string) => out.push({ severity: "error", category: "refs", path, message });

  const exIds = doc.exercises.map((e) => e.id);
  const tkIds = doc.toolkit.map((t) => t.id);
  const stIds = (doc.structure.stages ?? []).map((s) => s.id);
  const planIds = doc.plan_sections.map((p) => p.id);
  const areaIds = doc.selfcheck?.areas.map((a) => a.id) ?? [];

  for (const [name, ids] of [
    ["exercise", exIds],
    ["toolkit", tkIds],
    ["stage", stIds],
    ["plan section", planIds],
    ["self-check area", areaIds],
  ] as const) {
    const d = dupes(ids);
    if (d.length) err(name, `duplicate ${name} ids ${d.join(", ")}`);
  }

  // Stable field ids across the whole document must be unique too, because
  // answers attach to (exercise id, field id).
  const allFieldKeys = doc.exercises.flatMap((e) => e.fields.map((f) => `${e.id}.${f.id}`));
  const dupFields = dupes(allFieldKeys);
  if (dupFields.length) err("exercises", `duplicate field ids ${dupFields.join(", ")}`);

  const used = new Set<string>();
  for (const u of doc.units) {
    if (u.stage && !stIds.includes(u.stage)) err(`units[${u.number}]`, `stage ${u.stage} not defined`);
    for (const e of u.exercise_ids) {
      used.add(e);
      if (!exIds.includes(e)) err(`units[${u.number}]`, `uses undefined exercise ${e}`);
    }
    for (const t of u.new_toolkit_ids ?? []) if (!tkIds.includes(t)) err(`units[${u.number}]`, `uses undefined toolkit card ${t}`);
    for (const r of u.repeat_ids ?? []) {
      const ex = doc.exercises.find((x) => x.id === r);
      if (!ex) err(`units[${u.number}]`, `repeats undefined exercise ${r}`);
      else if (!(ex.repeat_units ?? []).includes(u.number)) err(`units[${u.number}]`, `repeats ${r} but ${r}.repeat_units does not include it`);
    }
  }
  for (const e of doc.exercises) {
    const fids = e.fields.map((f) => f.id);
    for (const fid of e.short_version?.field_ids ?? []) if (!fids.includes(fid)) err(`exercises.${e.id}`, `short version uses undefined field ${fid}`);
    for (const fp of e.feeds_plan ?? []) {
      if (!fids.includes(fp.field_id)) err(`exercises.${e.id}`, `feeds_plan uses undefined field ${fp.field_id}`);
      if (!planIds.includes(fp.plan_section)) err(`exercises.${e.id}`, `feeds undefined plan section ${fp.plan_section}`);
    }
    for (const f of e.fields) {
      if (f.prefill_from && !allFieldKeys.some((k) => k.endsWith(`.${f.prefill_from}`) || k === f.prefill_from)) {
        err(`exercises.${e.id}.fields.${f.id}`, `prefill_from ${f.prefill_from} is not a field in this workbook`);
      }
    }
    if (e.toolkit_link && !tkIds.includes(e.toolkit_link)) err(`exercises.${e.id}`, `links undefined toolkit card ${e.toolkit_link}`);
    if (e.stuck_alternative && !exIds.includes(e.stuck_alternative)) err(`exercises.${e.id}`, `stuck_alternative ${e.stuck_alternative} not defined`);
    for (const ru of e.repeat_units ?? []) {
      if (!doc.units.some((u) => u.number === ru && (u.repeat_ids ?? []).includes(e.id))) err(`exercises.${e.id}`, `says it repeats in unit ${ru} but that unit does not list it`);
    }
    if (!used.has(e.id)) err(`exercises.${e.id}`, "defined but not placed in any unit");
  }
  for (const item of doc.selfcheck?.items ?? []) {
    if (!areaIds.includes(item.area)) err(`selfcheck.items.${item.id}`, `uses undefined area ${item.area}`);
  }
  if (doc.checkin) {
    const cids = doc.checkin.fields.map((f) => f.id);
    for (const fid of doc.checkin.short_field_ids) if (!cids.includes(fid)) err("checkin", `short field ${fid} not defined`);
  }
  for (const r of doc.keep_going?.refresher_ids ?? []) if (!exIds.includes(r)) err("keep_going", `refresher ${r} not defined`);

  const numbers = doc.units.map((u) => u.number).sort((a, b) => a - b);
  const expected = Array.from({ length: doc.structure.count }, (_, i) => i + 1);
  if (JSON.stringify(numbers) !== JSON.stringify(expected)) err("units", `units must be 1 to ${doc.structure.count} exactly once, got ${numbers.join(", ")}`);

  for (const s of doc.structure.stages ?? []) {
    for (const n of s.units) if (n > doc.structure.count) err(`structure.stages.${s.id}`, `unit ${n} is beyond the programme length`);
  }
  for (const m of doc.milestones) {
    const mm = /^unit_complete:(\d+)$/.exec(m.trigger);
    if (mm && Number(mm[1]) > doc.structure.count) err(`milestones.${m.id}`, `unit ${mm[1]} is beyond the programme length`);
    const sm = /^stage_complete:([a-z0-9_]+)$/.exec(m.trigger);
    if (sm && !stIds.includes(sm[1]!)) err(`milestones.${m.id}`, `stage ${sm[1]} not defined`);
  }
}

// ---------- v3 field settings (F-113) ----------

const ISO_CURRENCY = /^[A-Z]{3}$/;
function knownCurrency(code: string | undefined): boolean {
  if (!code || !ISO_CURRENCY.test(code)) return false;
  try {
    new Intl.NumberFormat("en-GB", { style: "currency", currency: code });
    return true;
  } catch {
    return false;
  }
}

/** Upper bounds the engine renders to. Kept in step with packages/engine/src/values.ts. */
export const TABLE_MAX_ROWS = 20;
export const MATRIX_MAX_OPTIONS = 8;

type AnyField = Workbook["exercises"][number]["fields"][number];

/**
 * Settings the schema cannot express for number, currency, table and
 * decision_matrix: a real currency code, bounds that make sense, columns
 * where a grid needs them. Errors are filed as schema findings because a
 * field set up wrong cannot render as the author meant.
 */
export function checkFieldSettings(f: AnyField, path: string, out: Finding[]): void {
  const err = (message: string) => out.push({ severity: "error", category: "schema", path, message });
  const warn = (message: string) => out.push({ severity: "warning", category: "schema", path, message });
  const numeric = f.type === "number" || f.type === "currency";
  const grid = f.type === "table" || f.type === "decision_matrix";

  if (f.computed && !grid) warn(`computed is only read on table and decision_matrix fields, not ${f.type}`);
  if (f.min !== undefined && f.max !== undefined && f.min > f.max) err(`min ${f.min} is above max ${f.max}`);

  if (numeric) {
    if (f.options || f.rows || f.columns) warn(`options, rows and columns are not used by a ${f.type} field`);
    if (f.type === "currency" && !knownCurrency(f.unit)) err("currency fields need a three-letter currency code in unit, such as GBP or NGN");
    if (f.type === "number" && f.unit && f.unit.length > 20) warn("unit is shown beside the box; keep it short, such as hours or months");
  }

  if (f.type === "table") {
    if (!f.columns) err("a table needs columns (2 to 6 headings)");
    if (f.computed === "weighted_sum") err("weighted_sum is for decision matrices; a table can use sum or mean");
    if (f.unit && !knownCurrency(f.unit)) warn("unit on a table is read only as a currency code for its number columns");
    if (f.rows) {
      if (f.min_items !== undefined || f.max_items !== undefined) warn("rows fixes the table's rows, so min_items and max_items are ignored");
      if (f.rows.length > TABLE_MAX_ROWS) err(`a table shows at most ${TABLE_MAX_ROWS} fixed rows`);
    } else {
      if (f.min_items !== undefined && f.min_items < 1) err("min_items on a table must be at least 1");
      if (f.max_items !== undefined && f.max_items > TABLE_MAX_ROWS) err(`max_items on a table must be ${TABLE_MAX_ROWS} or fewer`);
      if (f.min_items !== undefined && f.max_items !== undefined && f.min_items > f.max_items) err("min_items is above max_items");
    }
  }

  if (f.type === "decision_matrix") {
    if (!f.columns) err("a decision matrix needs columns, one per criterion (2 to 6)");
    const given = f.options ?? f.rows;
    if (given) {
      if (given.length < 2 || given.length > MATRIX_MAX_OPTIONS) err(`a decision matrix compares 2 to ${MATRIX_MAX_OPTIONS} options, got ${given.length}`);
      if (f.min_items !== undefined || f.max_items !== undefined) warn("options are fixed, so min_items and max_items are ignored");
    } else {
      if (f.min_items !== undefined && f.min_items < 2) err("min_items on a decision matrix must be at least 2");
      if (f.max_items !== undefined && f.max_items > MATRIX_MAX_OPTIONS) err(`max_items on a decision matrix must be ${MATRIX_MAX_OPTIONS} or fewer`);
      if (f.min_items !== undefined && f.max_items !== undefined && f.min_items > f.max_items) err("min_items is above max_items");
    }
    const lo = f.min ?? 1;
    const hi = f.max ?? 5;
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 0 || hi > 10 || lo >= hi) err("a decision matrix scale needs whole numbers with 0 <= min < max <= 10");
    if (f.unit) warn("unit is not used by a decision matrix");
  }
}

function checkFields(doc: Workbook, out: Finding[]): void {
  const all = doc.exercises.flatMap((e) => e.fields.map((f) => ({ e, f })));
  for (const { e, f } of all) {
    const path = `exercises.${e.id}.fields.${f.id}`;
    checkFieldSettings(f, path, out);
    // A number or currency field can only take a figure from a figure.
    if (f.prefill_from && (f.type === "number" || f.type === "currency")) {
      const sources = all.filter((x) => x.f.id === f.prefill_from).map((x) => x.f);
      const usable = sources.some((s) => s.type === "number" || s.type === "currency" || (s.type === "table" && !!s.computed));
      if (sources.length && !usable) {
        out.push({ severity: "warning", category: "refs", path, message: `prefill_from ${f.prefill_from} is not a number, currency or computed table, so nothing will carry over` });
      }
    }
  }
  for (const f of doc.checkin?.fields ?? []) checkFieldSettings(f, `checkin.fields.${f.id}`, out);
}

function checkSafety(doc: Workbook, out: Finding[]): void {
  const err = (path: string, message: string) => out.push({ severity: "error", category: "safety", path, message });
  const wellbeing = doc.safety_tier !== "none";

  if (doc.genre === "wellbeing" && !wellbeing) err("safety_tier", "wellbeing genre must use the standard or higher safety tier");
  if (doc.genre !== "wellbeing" && doc.safety_tier === "higher") err("safety_tier", "higher tier is reserved for wellbeing titles");

  if (wellbeing) {
    if (!doc.safety_hub) err("safety_hub", "wellbeing workbook needs a safety_hub section");
    if (doc.selfcheck?.scored) err("selfcheck.scored", "wellbeing self-checks are unscored and show no bands");
    if (doc.safety_tier === "higher" && !doc.start.higher_tier_note) err("start.higher_tier_note", "higher-tier workbook needs start.higher_tier_note");
    for (const e of doc.exercises) {
      for (const f of e.fields) {
        if (f.type === "decision_matrix" || f.type === "currency") {
          out.push({ severity: "warning", category: "safety", path: `exercises.${e.id}.fields.${f.id}`, message: `field type ${f.type} is unusual in a wellbeing workbook` });
        }
      }
    }
  }
  const profile = genreProfile(doc.genre, doc.safety_tier);
  if (profile.requiresAdviceGuardrail && (!doc.advice_guardrail || doc.advice_guardrail === "none")) {
    err("advice_guardrail", `${doc.genre} workbooks must carry an advice guardrail (not legal, tax or financial advice)`);
  }
  // No streak triggers, by construction of the Milestone regex. Belt and braces:
  for (const m of doc.milestones) {
    if (/streak|consecutive|days_in_a_row|missed/i.test(m.trigger + " " + m.message)) err(`milestones.${m.id}`, "milestones must not reward streaks or count missed days");
  }
}

function checkCountsAndDepth(doc: Workbook, out: Finding[], opts: ValidateOptions): void {
  const sev: Severity = opts.lenient ? "warning" : "error";
  const push = (category: Category, path: string, message: string) => out.push({ severity: sev, category, path, message });
  const profile = genreProfile(doc.genre, doc.safety_tier);
  const n = doc.structure.count;

  // Depth rules (architecture 5.2 item 6)
  const unit1 = doc.units.find((u) => u.number === 1);
  if (!doc.card_line) push("depth", "card_line", "listing needs a card line");
  if (doc.depth === "listing") return; // listing fields are checked by the schema
  if (doc.units.length < n) push("depth", "units", `outline needs every unit with a focus line (${doc.units.length} of ${n})`);
  if (doc.depth === "outline") return;
  if (!unit1) push("depth", "units", "first_unit depth needs unit 1 with its exercises");
  if (doc.depth === "first_unit") return;

  // Full depth: counts from the genre profile
  const nEx = doc.exercises.length;
  const [perMin, perMax] = profile.exercisesPerUnit;
  const exMin = Math.floor(n * perMin), exMax = Math.ceil(n * perMax);
  if (nEx < exMin || nEx > exMax) push("count", "exercises", `${nEx} exercises, need ${exMin} to ${exMax} for ${n} ${doc.structure.unit}s`);

  if (profile.repeatableMin > 0) {
    const nRep = doc.exercises.filter((e) => (e.repeat_units ?? []).length > 0).length;
    const repMin = Math.floor(nEx * profile.repeatableMin);
    if (nRep < repMin) push("count", "exercises", `${nRep} repeatable exercises, need at least ${repMin}`);
  }
  const [tkMin, tkMax] = profile.toolkit;
  if (doc.toolkit.length < tkMin || doc.toolkit.length > tkMax) push("count", "toolkit", `${doc.toolkit.length} toolkit cards, need ${tkMin} to ${tkMax}`);
  const [msMin, msMax] = profile.milestones;
  if (doc.milestones.length < msMin || doc.milestones.length > msMax) push("count", "milestones", `${doc.milestones.length} milestones, need ${msMin} to ${msMax}`);

  const nComm = doc.exercises.filter((e) => e.community).length;
  if (nComm < profile.communityMin) push("count", "exercises", `${nComm} community exercises, need at least ${profile.communityMin}`);

  if (profile.requiresSelfcheck && !doc.selfcheck) push("count", "selfcheck", "this genre needs a self-check");
  if (profile.requiresCheckin && !doc.checkin) push("count", "checkin", "this genre needs a check-in");
  if (profile.requiresDailyCheck && !doc.daily_check) push("count", "daily_check", "this genre needs a daily check");

  if (doc.selfcheck) {
    const scUnits = doc.units.filter((u) => u.selfcheck).map((u) => u.number);
    if (scUnits.length === 0) push("count", "units", "self-check defined but no unit shows it");
  }

  let total = 0;
  for (const [p, s] of walk(doc)) if (isReaderCopy(p)) total += words(s);
  const [wMin, wMax] = profile.readerWordsPerUnit;
  if (total < wMin * n || total > wMax * n) push("count", "", `${total} reader-facing words, target ${wMin * n} to ${wMax * n} for ${n} ${doc.structure.unit}s`);
}

// ---------- entry point ----------

export function validateWorkbook(input: unknown, opts: ValidateOptions = {}): ValidationResult {
  const findings: Finding[] = [];
  const parsed = WorkbookV3.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      findings.push({ severity: "error", category: "schema", path: issue.path.join("."), message: issue.message });
    }
    return { ok: false, errors: findings, warnings: [] };
  }
  const doc = parsed.data;
  checkStyle(doc, findings, opts);
  checkLimits(doc, findings);
  checkRefs(doc, findings);
  checkFields(doc, findings);
  checkSafety(doc, findings);
  checkCountsAndDepth(doc, findings, opts);

  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  return { ok: errors.length === 0, errors, warnings, doc };
}

/** Check a short piece of copy (a bio, a card line) against claims and style for a genre. */
export function validateCopy(text: string, genre: Workbook["genre"], tier: Workbook["safety_tier"], spelling: Workbook["spelling"]): Finding[] {
  const fake = { genre, safety_tier: tier, spelling, copy: text } as unknown as Workbook;
  const out: Finding[] = [];
  // Reuse the style walker on a tiny object. Only the "copy" key is reader copy.
  checkStyle(fake, out, {});
  return out;
}

export function formatFindings(file: string, result: ValidationResult): string {
  const lines: string[] = [];
  if (result.ok && result.warnings.length === 0) return `PASS ${file}`;
  lines.push(`${result.ok ? "PASS" : "FAIL"} ${file}: ${result.errors.length} error(s), ${result.warnings.length} warning(s)`);
  for (const f of [...result.errors, ...result.warnings]) {
    lines.push(`  - ${f.severity === "warning" ? "warn " : ""}${f.category}: ${f.path ? f.path + ": " : ""}${f.message}${f.excerpt ? ` : ${JSON.stringify(f.excerpt)}` : ""}`);
  }
  return lines.join("\n");
}
export * from "./guide";
