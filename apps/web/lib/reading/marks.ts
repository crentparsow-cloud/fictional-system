/**
 * Highlights and notes (3.4). Pure helpers: the marker palette, how a
 * paragraph is named, matching saved marks back to the paragraphs on screen,
 * the undo trail, and the Markdown export.
 *
 * A mark is private to the reader. The colour and the place are stored in the
 * clear; the note and the paragraph's words are sealed (migration 0058).
 */

export const MARK_COLOURS = ["yellow", "green", "pink", "blue", "orange"] as const;
export type MarkColour = (typeof MARK_COLOURS)[number];

export const COLOUR_NAMES: Record<MarkColour, string> = { yellow: "Yellow", green: "Green", pink: "Pink", blue: "Blue", orange: "Orange" };

/**
 * The marker colours live in app/themes/marks.css as custom properties
 * (--mark-yellow and so on, with --mark-ink), light and dark, because colour
 * values belong in the theme files. The test reads that file and checks every
 * marker against its ink for WCAG 2 contrast (4.5 to 1 for text).
 */

/** WCAG 2 relative luminance of a #rrggbb colour. */
export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a colour: ${hex}`);
  const n = parseInt(m[1]!, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

export function isMarkColour(v: unknown): v is MarkColour {
  return typeof v === "string" && (MARK_COLOURS as readonly string[]).includes(v);
}

export const MAX_NOTE_CHARS = 2000;
export const MAX_EXCERPT_CHARS = 600;
export const MAX_MARKS_PER_ENROLMENT = 400;

/** What the server keeps for one mark, once opened. */
export interface Mark {
  id: string;
  ref: string;
  colour: MarkColour;
  note: string;
  /** The start of the paragraph's own words, kept so the export reads without the workbook. */
  excerpt: string;
  updatedAt: string;
}

/** A paragraph on the open screen. */
export interface Paragraph {
  ref: string;
  text: string;
}

const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9_.~-]+/g, "_").replace(/^_+|_+$/g, "");

/**
 * The name of a screen, from what the Player puts on it: its class, unit,
 * exercise and page. The result fits the ref pattern the database checks.
 */
export function screenRef(parts: { screen: string | null; unit: string | null; exercise: string | null; page: string | null }): string {
  const name = clean((parts.screen ?? "screen").replace(/^ak-/, "")) || "screen";
  const rest = [parts.unit, parts.exercise, parts.page].map((p) => clean(p ?? "")).filter(Boolean);
  return [name, ...rest].join(":").slice(0, 100);
}

export const paragraphRef = (screen: string, index: number): string => `${screen}#${index}`;

export const normaliseText = (s: string): string => s.replace(/\s+/g, " ").trim();
export const excerptOf = (text: string): string => normaliseText(text).slice(0, MAX_EXCERPT_CHARS);

/**
 * Match saved marks to the paragraphs on the open screen. The ref is tried
 * first and trusted when the paragraph still starts with the saved words.
 * If a section opened and shifted the numbering, the same words are looked
 * for on the screen instead. A mark that matches nothing is left unplaced:
 * it is kept, and it shows in the list, but it marks no paragraph.
 */
export function placeMarks(marks: readonly Mark[], paragraphs: readonly Paragraph[]): { placed: Map<string, Mark>; unplaced: Mark[] } {
  const placed = new Map<string, Mark>();
  const unplaced: Mark[] = [];
  const same = (a: string, b: string) => {
    const x = normaliseText(a);
    const y = normaliseText(b);
    const n = Math.min(40, x.length, y.length);
    return n > 0 && x.slice(0, n) === y.slice(0, n);
  };
  const used = new Set<string>();
  const prefix = (paraRef: string) => paraRef.slice(0, paraRef.lastIndexOf("#"));
  const screens = new Set(paragraphs.map((p) => prefix(p.ref)));
  for (const m of marks) {
    if (!screens.has(prefix(m.ref))) continue;
    const direct = paragraphs.find((p) => p.ref === m.ref);
    let hit = direct && (!m.excerpt || same(direct.text, m.excerpt)) ? direct : undefined;
    if (!hit && m.excerpt) hit = paragraphs.find((p) => prefix(p.ref) === prefix(m.ref) && !used.has(p.ref) && same(p.text, m.excerpt));
    if (hit && !used.has(hit.ref)) {
      used.add(hit.ref);
      placed.set(hit.ref, m);
    } else {
      unplaced.push(m);
    }
  }
  return { placed, unplaced };
}

/** The next colour in the palette, for "change colour". */
export function nextColour(c: MarkColour): MarkColour {
  return MARK_COLOURS[(MARK_COLOURS.indexOf(c) + 1) % MARK_COLOURS.length]!;
}

/**
 * Where the margin notes sit. Each wants to be level with its paragraph; if
 * two would overlap, the lower one moves down. Order is kept. Returns the top
 * of each note, in the order given.
 */
export function stackTops(items: ReadonlyArray<{ top: number; height: number }>, gap = 8): number[] {
  const order = items.map((_, i) => i).sort((a, b) => items[a]!.top - items[b]!.top || a - b);
  const out = new Array<number>(items.length).fill(0);
  let floor = -Infinity;
  for (const i of order) {
    const top = Math.max(items[i]!.top, floor);
    out[i] = top;
    floor = top + items[i]!.height + gap;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Undo. Each step records the mark as it was before and as it is after.
// ---------------------------------------------------------------------------

export interface MarkChange {
  ref: string;
  before: Mark | null;
  after: Mark | null;
}

export const UNDO_DEPTH = 30;

/** Add a change to the trail, dropping the oldest past the limit. */
export function pushChange(trail: readonly MarkChange[], change: MarkChange): MarkChange[] {
  if (change.before === null && change.after === null) return [...trail];
  const next = [...trail, change];
  return next.length > UNDO_DEPTH ? next.slice(next.length - UNDO_DEPTH) : next;
}

/** The change that undoes the last one, and the trail without it. */
export function popChange(trail: readonly MarkChange[]): { change: MarkChange | null; trail: MarkChange[] } {
  if (!trail.length) return { change: null, trail: [] };
  const last = trail[trail.length - 1]!;
  return { change: last, trail: trail.slice(0, -1) };
}

/** Apply a change (or its undo) to a list of marks. */
export function applyChange(marks: readonly Mark[], ref: string, to: Mark | null): Mark[] {
  const rest = marks.filter((m) => m.ref !== ref);
  return to ? [...rest, to] : rest;
}

/** What to do with a press of "h" on a paragraph: add, change colour, or remove. */
export function highlightMove(existing: Mark | null, colour: MarkColour): "add" | "remove" | "recolour" {
  if (!existing) return "add";
  return existing.colour === colour ? "remove" : "recolour";
}

// ---------------------------------------------------------------------------
// Markdown export.
// ---------------------------------------------------------------------------

const TITLES: Record<string, string> = {
  start: "Start",
  toolkit: "Toolkit",
  plan: "Your plan",
  progress: "Progress",
  finish: "Finish",
  keep: "Keep going",
  daily: "Daily check",
  checkin: "Check-in",
  selfcheck: "Self-check",
};

const words = (id: string) => id.replace(/[_~.-]+/g, " ").trim();
const sentenceCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** A plain heading for the screen a ref belongs to. */
export function screenHeading(ref: string, unitWord = "unit"): string {
  const base = ref.includes("#") ? ref.slice(0, ref.lastIndexOf("#")) : ref;
  const [name = "", ...rest] = base.split(":");
  if (name === "unit" && rest[0]) return `${sentenceCase(unitWord)} ${rest[0]}`;
  if (name === "exercise") {
    const id = rest.find((r) => r && !/^\d+$/.test(r) && !["intro", "example", "steps", "your_turn"].includes(r)) ?? rest[0];
    return id ? sentenceCase(words(id)) : "Exercise";
  }
  return TITLES[name] ?? sentenceCase(words(name)) ?? "Notes";
}

const refOrder = (ref: string): [string, number] => {
  const i = ref.lastIndexOf("#");
  return [i < 0 ? ref : ref.slice(0, i), i < 0 ? 0 : Number(ref.slice(i + 1)) || 0];
};

/** One workbook's marks, for the all-highlights page (/you/highlights). */
export interface MarkGroup {
  enrolmentId: string;
  title: string;
  marks: Mark[];
}

/**
 * Group a reader's marks by workbook for the highlights page. Workbooks are
 * ordered by their most recent mark, newest first. Within a workbook the
 * marks follow the same order as the export (screen, then paragraph).
 */
export function groupMarksByWorkbook(items: ReadonlyArray<{ enrolmentId: string; title: string; mark: Mark }>): MarkGroup[] {
  const groups = new Map<string, MarkGroup>();
  for (const { enrolmentId, title, mark } of items) {
    const g = groups.get(enrolmentId) ?? { enrolmentId, title, marks: [] };
    g.marks.push(mark);
    groups.set(enrolmentId, g);
  }
  const latest = (g: MarkGroup) => Math.max(...g.marks.map((m) => Date.parse(m.updatedAt) || 0));
  for (const g of groups.values()) {
    g.marks.sort((a, b) => {
      const [sa, ia] = refOrder(a.ref);
      const [sb, ib] = refOrder(b.ref);
      return sa === sb ? ia - ib : sa.localeCompare(sb, "en", { numeric: true });
    });
  }
  return [...groups.values()].sort((a, b) => latest(b) - latest(a) || a.title.localeCompare(b.title));
}

export interface ExportInput {
  title: string;
  marks: readonly Mark[];
  unitWord?: string;
  /** Already formatted by the caller, for example "21 October 2026". */
  date: string;
}

const quote = (s: string) => s.split(/\r?\n/).map((l) => `> ${l}`.trimEnd()).join("\n");

/**
 * The export template. A title, the date, then one heading per screen with
 * each marked paragraph as a quotation, its marker colour, and the note
 * underneath. Plain Markdown with no front matter, so any notes app opens it.
 */
export function exportMarkdown({ title, marks, unitWord = "unit", date }: ExportInput): string {
  const sorted = [...marks].sort((a, b) => {
    const [sa, ia] = refOrder(a.ref);
    const [sb, ib] = refOrder(b.ref);
    return sa === sb ? ia - ib : sa.localeCompare(sb, "en", { numeric: true });
  });
  const lines: string[] = [`# Notes from ${title}`, "", `Exported ${date}. These are your own highlights and notes. Nobody else can see them.`, ""];
  if (!sorted.length) {
    lines.push("You have not marked anything yet.", "");
    return lines.join("\n");
  }
  let heading = "";
  for (const m of sorted) {
    const h = screenHeading(m.ref, unitWord);
    if (h !== heading) {
      heading = h;
      lines.push(`## ${h}`, "");
    }
    if (m.excerpt) lines.push(quote(m.excerpt + (m.excerpt.length >= MAX_EXCERPT_CHARS ? "..." : "")), "");
    lines.push(`Marker: ${COLOUR_NAMES[m.colour].toLowerCase()}`, "");
    if (m.note.trim()) lines.push(m.note.trim(), "");
  }
  return lines.join("\n");
}

/** A safe file name for the export. */
export function exportFileName(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${slug || "workbook"}-notes.md`;
}
