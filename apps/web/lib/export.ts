import { splitFieldKey } from "@/lib/answer-fields";

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
 *             "updated_at": "..."
 *           }
 *         ],
 *         "unreadable": 0                    // rows that would not unseal, left out
 *       }
 *     ]
 *   }
 *
 * Exports carry prompts (field labels) and answers, never the teaching text.
 */

export const EXPORT_FORMAT = "akana.export";
export const EXPORT_VERSION = 1;

export interface ExerciseLabels {
  title: string | null;
  unit: number | null;
  fields: Record<string, string>;
}

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
}

export interface ExportWorkbook {
  workbook_code: string | null;
  workbook_title: string | null;
  status: string;
  started_at: string;
  answers: ExportAnswer[];
  unreadable: number;
}

export interface ExportDocument {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exported_at: string;
  workbooks: ExportWorkbook[];
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
      for (const f of Array.isArray(ex.fields) ? ex.fields : []) {
        if (!isRecord(f)) continue;
        const fid = str(f.id);
        const label = str(f.label);
        if (fid && label) fields[fid] = label;
      }
      out[id] = { title: str(ex.title), unit, fields };
    }
  }
  return out;
}

/** Where an answer sits: unit, exercise and labels, resolved as far as the labels allow. */
export function placeAnswer(field: string, labels: LabelIndex): Omit<ExportAnswer, "value" | "updated_at"> {
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
): ExportDocument {
  const workbooks: ExportWorkbook[] = enrolments.map((e) => {
    const rows = answers
      .filter((a) => a.enrolmentId === e.id)
      .map((a) => ({ ...placeAnswer(a.field, e.labels), value: a.value, updated_at: a.updatedAt }))
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
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exported_at: now.toISOString(), workbooks };
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
  return a.scope;
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
              const lines = valueLines(a.value);
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
@media print{body{margin:0;max-width:none}h2{break-after:avoid}}
</style>
</head>
<body>
<h1>My work</h1>
<p class="lead">Made on ${e(longDate(doc.exported_at))}. Everything here is in your own words.</p>
${body || "<p>Nothing written yet.</p>"}
</body>
</html>
`;
}
