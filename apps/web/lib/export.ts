import { FIELD_TYPES } from "@akana/schema";
import { printableValue, type FieldDef, type Printable } from "@akana/engine/values";
import { splitFieldKey } from "@/lib/answer-fields";
import { FEATURE_NAME as PARTNER_FEATURE, SHARE_LEVELS, type ShareLevel } from "@/lib/partner";

/**
 * Export of the reader's own work (F-023). Pure: the route reads the rows
 * under RLS, unseals them, and hands plain values here. Nothing in this file
 * touches the network, keys or the session, so it is safe to test directly.
 *
 * JSON shape, version 1. Fields are only ever added, never renamed:
 *
 *   {
 *     "format": "akana.export",
 *     "version": 1,
 *     "exported_at": "2026-10-07T09:00:00.000Z",
 *     "workbooks": [
 *       {
 *         "workbook_code": "AK-ABCDE" | null,
 *         "workbook_title": "..." | null,
 *         "status": "active" | "paused" | "finished",
 *         "started_at": "...",
 *         "answers": [
 *           {
 *             "unit": 3 | null,             // null when the answer is not tied to a unit
 *             "exercise_id": "plan_first_step" | null,  // null for check-ins and screens
 *             "exercise_title": "..." | null,
 *             "scope": "plan_first_step" | "plan_first_step~r" | "checkin:3" | "start",
 *             "field_id": "what",
 *             "field_label": "..." | null,
 *             "value": <the reader's value, as saved>,
 *             "updated_at": "...",
 *             "field_type": "currency" | null,      // added 7 Oct 2026 (F-113)
 *             "display": null | {                   // added 7 Oct 2026 (F-113), number, currency,
 *               "kind": "lines", "lines": ["£1,250.00"]  // table and decision_matrix only
 *             } | {
 *               "kind": "table", "head": [...], "rows": [[...]], "foot": [...] | null, "caption": "..." | null
 *             }
 *           }
 *         ],
 *         "unreadable": 0                    // rows that would not unseal, left out
 *       }
 *     ],
 *     "check_in_partner": null | {          // added 8 Oct 2026 (F-030, F-023)
 *       "partner_name": "Sam",
 *       "share_level": 1 | 2 | 3,
 *       "share_level_label": "Stage reached",
 *       "status": "invited" | "accepted" | "declined" | "stopped",
 *       "kind_words": [{ "body": "...", "received_at": "..." }]
 *     }
 *   }
 *
 * Exports carry prompts (field labels) and answers, never the teaching text.
 * The check-in partner part carries the partner's first name, the share
 * level, the status and the kind words received. Never the partner's email,
 * the reader's note, tokens or anything about sends.
 */

export const EXPORT_FORMAT = "akana.export";
export const EXPORT_VERSION = 1;

export interface ExerciseLabels {
  title: string | null;
  unit: number | null;
  fields: Record<string, string>;
  /** Field settings by id, present only when the section gives field types. Used to format figures and grids. */
  defs?: Record<string, FieldDef>;
}

/** Field types whose saved value is not readable on its own: a bare number or a grid. */
const FORMATTED_TYPES = new Set(["number", "currency", "table", "decision_matrix"]);

/** Exercise id to labels, built from the unit sections the reader can read. */
export type LabelIndex = Record<string, ExerciseLabels>;

export interface ExportEnrolmentInput {
  id: string;
  workbookCode: string | null;
  workbookTitle: string | null;
  status: string;
  startedAt: string;
  labels: LabelIndex;
}

export interface ExportAnswerInput {
  enrolmentId: string;
  field: string;
  value: unknown;
  updatedAt: string;
}

export interface ExportAnswer {
  unit: number | null;
  exercise_id: string | null;
  exercise_title: string | null;
  scope: string;
  field_id: string;
  field_label: string | null;
  value: unknown;
  updated_at: string;
  /** The field's type when the labels know it. Added in F-113. */
  field_type: string | null;
  /** A ready-to-read view of a figure, table or decision matrix, with currency and totals. Added in F-113. */
  display: Printable | null;
}

export interface ExportWorkbook {
  workbook_code: string | null;
  workbook_title: string | null;
  status: string;
  started_at: string;
  answers: ExportAnswer[];
  unreadable: number;
}

export interface ExportKindWord {
  body: string;
  received_at: string;
}

export interface ExportPartner {
  partner_name: string;
  share_level: ShareLevel;
  share_level_label: string;
  status: string;
  kind_words: ExportKindWord[];
}

export interface ExportDocument {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exported_at: string;
  workbooks: ExportWorkbook[];
  /** The reader's check-in partner, if they have ever invited one. Added 8 Oct 2026. */
  check_in_partner: ExportPartner | null;
}

/** What the route reads under RLS: the reader's own partner row and replies. Extra columns are ignored. */
export interface ExportPartnerInput {
  partner_name: unknown;
  share_level: unknown;
  status: unknown;
  replies: { body: unknown; created_at: unknown }[];
}

/**
 * Only the four things the export promises, whatever else the row holds:
 * name, share level, status and the kind words received, oldest first.
 */
export function partnerForExport(input: ExportPartnerInput | null | undefined): ExportPartner | null {
  if (!input) return null;
  const name = str(input.partner_name);
  const level = input.share_level;
  if (!name || (level !== 1 && level !== 2 && level !== 3)) return null;
  const kind_words = (input.replies ?? [])
    .filter((r): r is { body: string; created_at: string } => typeof r.body === "string" && r.body.trim() !== "" && typeof r.created_at === "string")
    .map((r) => ({ body: r.body, received_at: r.created_at }))
    .sort((a, b) => a.received_at.localeCompare(b.received_at));
  return {
    partner_name: name,
    share_level: level,
    share_level_label: SHARE_LEVELS[level].label,
    status: str(input.status) ?? "unknown",
    kind_words,
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

/**
 * Build the label index from workbook_sections rows of kind "unit". Each body
 * is the unit object plus its exercises, as app.publish_version writes it.
 * Anything malformed is skipped: a missing label falls back to the id.
 */
export function labelsFromUnitSections(sections: { unit_number: number | null; body: unknown }[]): LabelIndex {
  const out: LabelIndex = {};
  for (const s of sections) {
    if (!isRecord(s.body)) continue;
    const unit = typeof s.unit_number === "number" ? s.unit_number : typeof s.body.number === "number" ? s.body.number : null;
    const exercises = Array.isArray(s.body.exercises) ? s.body.exercises : [];
    for (const ex of exercises) {
      if (!isRecord(ex)) continue;
      const id = str(ex.id);
      if (!id || out[id]) continue;
      const fields: Record<string, string> = {};
      const defs: Record<string, FieldDef> = {};
      for (const f of Array.isArray(ex.fields) ? ex.fields : []) {
        if (!isRecord(f)) continue;
        const fid = str(f.id);
        const label = str(f.label);
        if (fid && label) fields[fid] = label;
        const def = fieldDef(f);
        if (fid && def) defs[fid] = def;
      }
      out[id] = Object.keys(defs).length ? { title: str(ex.title), unit, fields, defs } : { title: str(ex.title), unit, fields };
    }
  }
  return out;
}

const strings = (v: unknown): string[] | undefined => (Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** The settings that shape how a value prints, read defensively from a stored section. */
function fieldDef(f: Record<string, unknown>): FieldDef | null {
  const type = typeof f.type === "string" && (FIELD_TYPES as readonly string[]).includes(f.type) ? (f.type as FieldDef["type"]) : null;
  if (!type) return null;
  const computed = f.computed === "sum" || f.computed === "mean" || f.computed === "weighted_sum" ? f.computed : undefined;
  const def: FieldDef = { type, label: typeof f.label === "string" ? f.label : "" };
  const columns = strings(f.columns);
  const rows = strings(f.rows);
  const options = strings(f.options);
  if (columns) def.columns = columns;
  if (rows) def.rows = rows;
  if (options) def.options = options;
  for (const k of ["min", "max", "step", "min_items", "max_items"] as const) {
    const n = num(f[k]);
    if (n !== undefined) def[k] = n;
  }
  if (typeof f.unit === "string") def.unit = f.unit;
  if (computed) def.computed = computed;
  return def;
}

function describeValue(def: FieldDef | undefined, value: unknown): Pick<ExportAnswer, "field_type" | "display"> {
  if (!def) return { field_type: null, display: null };
  return { field_type: def.type, display: FORMATTED_TYPES.has(def.type) ? printableValue(def, value) : null };
}

/** Where an answer sits: unit, exercise and labels, resolved as far as the labels allow. */
export function placeAnswer(field: string, labels: LabelIndex): Omit<ExportAnswer, "value" | "updated_at" | "field_type" | "display"> {
  const parts = splitFieldKey(field);
  if (!parts) {
    return { unit: null, exercise_id: null, exercise_title: null, scope: field, field_id: field, field_label: null };
  }
  const { scope, fieldId } = parts;
  const checkin = /^checkin:(\d+)$/.exec(scope);
  if (checkin) {
    return { unit: Number(checkin[1]), exercise_id: null, exercise_title: null, scope, field_id: fieldId, field_label: null };
  }
  if (scope.includes(":") || scope === "start" || scope === "keep_going") {
    return { unit: null, exercise_id: null, exercise_title: null, scope, field_id: fieldId, field_label: null };
  }
  const exerciseId = scope.endsWith("~r") ? scope.slice(0, -2) : scope;
  const l = labels[exerciseId];
  return {
    unit: l?.unit ?? null,
    exercise_id: exerciseId,
    exercise_title: l?.title ?? null,
    scope,
    field_id: fieldId,
    field_label: l?.fields[fieldId] ?? null,
  };
}

const byPlace = (a: ExportAnswer, b: ExportAnswer) =>
  (a.unit ?? Number.MAX_SAFE_INTEGER) - (b.unit ?? Number.MAX_SAFE_INTEGER) ||
  a.scope.localeCompare(b.scope) ||
  a.field_id.localeCompare(b.field_id);

/**
 * Put the export together. Answers for an enrolment not in the list are
 * dropped: the caller passes only the reader's own enrolments, and this is
 * the second line that keeps anyone else's rows out.
 */
export function buildExport(
  enrolments: ExportEnrolmentInput[],
  answers: ExportAnswerInput[],
  unreadableByEnrolment: Record<string, number>,
  now: Date,
  partner: ExportPartner | null = null,
): ExportDocument {
  const workbooks: ExportWorkbook[] = enrolments.map((e) => {
    const rows = answers
      .filter((a) => a.enrolmentId === e.id)
      .map((a) => {
        const place = placeAnswer(a.field, e.labels);
        const def = place.exercise_id ? e.labels[place.exercise_id]?.defs?.[place.field_id] : undefined;
        return { ...place, value: a.value, updated_at: a.updatedAt, ...describeValue(def, a.value) };
      })
      .sort(byPlace);
    return {
      workbook_code: e.workbookCode,
      workbook_title: e.workbookTitle,
      status: e.status,
      started_at: e.startedAt,
      answers: rows,
      unreadable: unreadableByEnrolment[e.id] ?? 0,
    };
  });
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exported_at: now.toISOString(), workbooks, check_in_partner: partner };
}

export function exportJson(doc: ExportDocument): string {
  return JSON.stringify(doc, null, 2) + "\n";
}

/** Neutral file names: no title, no workbook, only the date. */
export function exportFileName(format: "json" | "html", now: Date): string {
  return `akana-my-work-${now.toISOString().slice(0, 10)}.${format}`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** A saved value as plain lines of text, for the printable page. */
export function valueLines(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") return value.trim() === "" ? [] : [value];
  if (typeof value === "boolean") return [value ? "Yes" : "No"];
  if (typeof value === "number") return [String(value)];
  if (Array.isArray(value)) {
    return value.flatMap((v) => {
      const inner = valueLines(v);
      return isRecord(v) || Array.isArray(v) ? [inner.join("; ")].filter(Boolean) : inner;
    });
  }
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([k, v]) => {
      const inner = valueLines(v);
      return inner.length ? [`${k}: ${inner.join(", ")}`] : [];
    });
  }
  return [];
}

function longDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(d);
}

export interface HtmlOptions {
  /** F-023: the header is neutral unless the reader ticks "Show the book title". */
  showTitles: boolean;
}

function workbookHeading(w: ExportWorkbook, index: number, showTitles: boolean): string {
  if (showTitles && w.workbook_title) return w.workbook_title;
  return w.workbook_code ? `Workbook ${w.workbook_code}` : `Workbook ${index + 1}`;
}

function scopeHeading(a: ExportAnswer): string {
  if (a.exercise_id) {
    const title = a.exercise_title ?? a.exercise_id;
    return a.scope.endsWith("~r") ? `${title} (again)` : title;
  }
  if (a.scope.startsWith("checkin:")) return "Check-in";
  if (a.scope === "start") return "Before you started";
  if (a.scope === "keep_going") return "Keep going";
  if (a.scope === "plan:lines") return "My plan, your changes";
  if (a.scope === "selfcheck:0") return "Starting self-check";
  if (a.scope.startsWith("selfcheck:")) return "Self-check";
  if (a.scope.startsWith("daily:")) return `Daily check, ${a.scope.slice("daily:".length)}`;
  return a.scope;
}

/** A figure grid as a real table, so it reads in order and prints with its headings. */
function printableTableHtml(p: Extract<Printable, { kind: "table" }>): string {
  const e = escapeHtml;
  const head = `<thead><tr>${p.head.map((h) => `<th scope="col">${e(h)}</th>`).join("")}</tr></thead>`;
  const body = `<tbody>${p.rows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${e(c)}</th>` : `<td>${e(c)}</td>`)).join("")}</tr>`).join("")}</tbody>`;
  const foot = p.foot ? `<tfoot><tr>${p.foot.map((c, i) => (i === 0 ? `<th scope="row">${e(c)}</th>` : `<td>${e(c)}</td>`)).join("")}</tr></tfoot>` : "";
  const caption = p.caption ? `<p class="caption">${e(p.caption)}</p>` : "";
  return `<table>${head}${body}${foot}</table>${caption}`;
}

const PARTNER_STATUS: Record<string, string> = {
  invited: "Invited, not answered yet",
  accepted: "Accepted",
  declined: "Declined",
  stopped: "Stopped",
};

/** The check-in partner part of the printable page. Empty when there is none. */
function partnerHtml(p: ExportPartner | null): string {
  if (!p) return "";
  const e = escapeHtml;
  const words = p.kind_words.length
    ? p.kind_words.map((w) => `<div class="field"><p class="label">${e(longDate(w.received_at))}</p><p>${e(w.body)}</p></div>`).join("")
    : `<p class="empty">No kind words yet.</p>`;
  return `<article><h2>${e(PARTNER_FEATURE)}</h2>
<div class="field"><p class="label">Name</p><p>${e(p.partner_name)}</p></div>
<div class="field"><p class="label">What they get</p><p>${e(p.share_level_label)}</p></div>
<div class="field"><p class="label">Status</p><p>${e(PARTNER_STATUS[p.status] ?? p.status)}</p></div>
<section><h4>Kind words received</h4>${words}</section></article>`;
}

/** A plain page that prints well. No scripts, no outside requests. */
export function renderExportHtml(doc: ExportDocument, opts: HtmlOptions): string {
  const e = escapeHtml;
  const body = doc.workbooks
    .map((w, i) => {
      const groups: { key: string; unit: number | null; heading: string; rows: ExportAnswer[] }[] = [];
      for (const a of w.answers) {
        const key = `${a.unit ?? ""}|${a.scope}`;
        const last = groups[groups.length - 1];
        if (last && last.key === key) last.rows.push(a);
        else groups.push({ key, unit: a.unit, heading: scopeHeading(a), rows: [a] });
      }
      let lastUnit: number | null | undefined;
      const sections = groups
        .map((g) => {
          const unitHead = g.unit !== lastUnit && g.unit !== null ? `<h3>Unit ${g.unit}</h3>` : "";
          lastUnit = g.unit;
          const fields = g.rows
            .map((a) => {
              if (a.display?.kind === "table") {
                return `<div class="field"><p class="label">${e(a.field_label ?? a.field_id)}</p>${printableTableHtml(a.display)}</div>`;
              }
              const lines = a.display ? a.display.lines : valueLines(a.value);
              const text = lines.length ? lines.map((l) => e(l).replace(/\n/g, "<br>")).join("<br>") : "<span class=\"empty\">No answer</span>";
              return `<div class="field"><p class="label">${e(a.field_label ?? a.field_id)}</p><p>${text}</p></div>`;
            })
            .join("");
          return `${unitHead}<section><h4>${e(g.heading)}</h4>${fields}</section>`;
        })
        .join("");
      const note = w.unreadable
        ? `<p class="note">${w.unreadable} saved ${w.unreadable === 1 ? "answer" : "answers"} could not be opened and ${w.unreadable === 1 ? "is" : "are"} not shown.</p>`
        : "";
      return `<article><h2>${e(workbookHeading(w, i, opts.showTitles))}</h2><p class="meta">Started ${e(longDate(w.started_at))}</p>${sections || "<p>Nothing written yet.</p>"}${note}</article>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>My work</title>
<style>
body{font:16px/1.6 Georgia,"Times New Roman",serif;max-width:42rem;margin:2.5rem auto;padding:0 1.25rem;color:#16222b;background:#fff}
h1,h2,h3,h4,.label{font-family:Helvetica,Arial,sans-serif}
h1{font-size:1.6rem;margin:0 0 .25rem}h2{font-size:1.3rem;margin:2.5rem 0 .25rem;border-bottom:1px solid #ccd;padding-bottom:.25rem}
h3{font-size:1.05rem;margin:1.75rem 0 .5rem;text-transform:uppercase;letter-spacing:.06em;color:#445}
h4{font-size:1rem;margin:1.25rem 0 .5rem}
.label{font-weight:700;font-size:.9rem;margin:.75rem 0 .1rem}.field p{margin:0}
.meta,.note,.empty,.lead{color:#556}.empty{font-style:italic}
article{break-inside:auto}section{break-inside:avoid}
table{border-collapse:collapse;width:100%;margin:.35rem 0;font-size:.95rem}th,td{border:1px solid #ccd;padding:.3rem .5rem;text-align:left;vertical-align:top}
thead th{font-family:Helvetica,Arial,sans-serif;font-size:.85rem;background:#f3f4f7}td{font-variant-numeric:tabular-nums}tfoot th,tfoot td{font-weight:700;border-top:2px solid #889}
.caption{font-style:italic;color:#445}tr{break-inside:avoid}
@media print{body{margin:0;max-width:none}h2{break-after:avoid}}
</style>
</head>
<body>
<h1>My work</h1>
<p class="lead">Made on ${e(longDate(doc.exported_at))}. Everything here is in your own words.</p>
${body || "<p>Nothing written yet.</p>"}
${partnerHtml(doc.check_in_partner)}
</body>
</html>
`;
}
