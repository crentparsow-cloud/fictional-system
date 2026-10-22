/**
 * The end-of-programme question (build list 8.5). Pure rules for the Studio
 * form: the wording, two to five fixed answers, and how results are shown.
 * The database checks again (migration 0057). The question is not offered on
 * titles with a safety tier. Answers are counted, never shown per reader, and
 * any count under 10 is hidden in the database.
 */
export const QUESTION_MIN = 5;
export const QUESTION_MAX = 140;
export const OPTION_MAX = 60;
export const OPTIONS_MIN = 2;
export const OPTIONS_MAX = 5;

export interface QuestionInput {
  question: string;
  options: string[];
}

export type ParsedQuestion = { ok: true; value: QuestionInput | null } | { ok: false; message: string };

function tidy(s: string, max: number): string {
  return s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** An empty question clears it. Otherwise the wording and two to five different answers are needed. */
export function parseQuestionForm(question: unknown, options: readonly unknown[]): ParsedQuestion {
  const rawQ = typeof question === "string" ? question : "";
  const q = tidy(rawQ, QUESTION_MAX + 1);
  const opts = options
    .map((o) => (typeof o === "string" ? tidy(o, OPTION_MAX + 1) : ""))
    .filter(Boolean);
  if (q === "" && opts.length === 0) return { ok: true, value: null };
  if (q.length < QUESTION_MIN || q.length > QUESTION_MAX) return { ok: false, message: `The question needs ${QUESTION_MIN} to ${QUESTION_MAX} characters.` };
  if (opts.some((o) => o.length > OPTION_MAX)) return { ok: false, message: `Each answer can be up to ${OPTION_MAX} characters.` };
  if (opts.length < OPTIONS_MIN || opts.length > OPTIONS_MAX) return { ok: false, message: `Give ${OPTIONS_MIN} to ${OPTIONS_MAX} answers.` };
  if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) return { ok: false, message: "Each answer must be different." };
  if (/[?]/.test(q) === false) return { ok: false, message: "Write it as a question, ending with a question mark." };
  return { ok: true, value: { question: q, options: opts } };
}

export interface ResultRow {
  option_index: number;
  label: string;
  n: number | string | null;
  total: number | string | null;
  suppressed: boolean;
}

export interface ResultLine {
  label: string;
  count: string;
  share: string;
}

export interface ResultsView {
  /** "Fewer than 10 readers have answered yet" until the database releases totals. */
  summary: string;
  lines: ResultLine[];
}

/** Counts as the database sent them; hidden cells stay hidden, and a share is shown only when both parts are. */
export function resultsView(rows: readonly ResultRow[], threshold = 10): ResultsView {
  const head = rows[0];
  if (!head) return { summary: "", lines: [] };
  const total = head.total === null || head.total === undefined ? null : Number(head.total);
  const sorted = [...rows].sort((a, b) => a.option_index - b.option_index);
  if (total === null) {
    return { summary: `Fewer than ${threshold} readers have answered, so no numbers are shown yet.`, lines: sorted.map((r) => ({ label: r.label, count: `Fewer than ${threshold}`, share: "" })) };
  }
  return {
    summary: `${total.toLocaleString("en-GB")} readers have answered.`,
    lines: sorted.map((r) => {
      const n = r.suppressed || r.n === null ? null : Number(r.n);
      return { label: r.label, count: n === null ? `Fewer than ${threshold}` : n.toLocaleString("en-GB"), share: n === null ? "" : `${Math.round((n / total) * 100)}%` };
    }),
  };
}
