import type { WorkbookV3 } from "@akana/schema";

/**
 * Put a published workbook back together from the section rows RLS lets a
 * reader see. This inverts app.publish_version() in migration 0002:
 *
 *   listing    the catalogue fields plus `outline` [{number, stage, focus}]
 *   start      { start, selfcheck, checkin, daily_check, plan_sections, milestones }
 *   unit N     the unit object plus `exercises` (resolved, in exercise_ids order)
 *   toolkit    { cards }
 *   finish     the finish object
 *   keep_going the keep_going object
 *   safety_hub the safety hub
 *
 * A unit the reader may not load yet (no entitlement) is rebuilt from the
 * outline alone and listed in `locked`, so the Player can show a calm
 * notice instead of its exercises. Missing toolkit, finish or keep_going are
 * given empty stand-ins and flagged the same way. Nothing here invents
 * content; the internal block never reaches sections in the first place.
 */

export interface SectionRow {
  kind: "listing" | "start" | "unit" | "toolkit" | "finish" | "keep_going" | "safety_hub";
  unit_number: number | null;
  body: unknown;
  free: boolean;
}

export interface RebuiltWorkbook {
  workbook: WorkbookV3;
  /** Unit numbers present in the outline but not loaded. */
  lockedUnits: number[];
  /** Section kinds the outline implies but RLS did not return. */
  missing: Array<"toolkit" | "finish" | "keep_going">;
}

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function rebuildWorkbook(rows: SectionRow[]): RebuiltWorkbook | null {
  const listing = rows.find((r) => r.kind === "listing");
  const start = rows.find((r) => r.kind === "start");
  if (!listing || !start) return null;

  const l = asObj(listing.body);
  const s = asObj(start.body);
  const { outline: outlineRaw, ...catalogue } = l;
  const outline = asArr(outlineRaw).map(asObj);

  const unitRows = rows
    .filter((r) => r.kind === "unit" && r.unit_number !== null)
    .sort((a, b) => (a.unit_number ?? 0) - (b.unit_number ?? 0));

  const exercises = new Map<string, Obj>();
  const units: Obj[] = [];
  const loaded = new Set<number>();
  for (const row of unitRows) {
    const { exercises: ex, ...unit } = asObj(row.body);
    for (const e of asArr(ex).map(asObj)) {
      const id = typeof e.id === "string" ? e.id : null;
      if (id && !exercises.has(id)) exercises.set(id, e);
    }
    units.push(unit);
    loaded.add(row.unit_number as number);
  }

  const lockedUnits: number[] = [];
  for (const o of outline) {
    const n = typeof o.number === "number" ? o.number : Number(o.number);
    if (!Number.isFinite(n) || loaded.has(n)) continue;
    lockedUnits.push(n);
    units.push({ number: n, stage: o.stage, focus: typeof o.focus === "string" ? o.focus : "", exercise_ids: [] });
  }
  units.sort((a, b) => Number(a.number) - Number(b.number));

  const missing: RebuiltWorkbook["missing"] = [];
  const toolkitRow = rows.find((r) => r.kind === "toolkit");
  const finishRow = rows.find((r) => r.kind === "finish");
  const keepGoingRow = rows.find((r) => r.kind === "keep_going");
  const safetyRow = rows.find((r) => r.kind === "safety_hub");
  if (!toolkitRow) missing.push("toolkit");
  if (!finishRow) missing.push("finish");
  // keep_going is optional in the schema, so it is only "missing" when paid
  // units are also missing: that is the entitlement case, not an absent block.
  if (!keepGoingRow && lockedUnits.length) missing.push("keep_going");

  const doc: Obj = {
    ...catalogue,
    ...s,
    plan_sections: asArr(s.plan_sections),
    milestones: asArr(s.milestones),
    units,
    exercises: [...exercises.values()],
    toolkit: toolkitRow ? asArr(asObj(toolkitRow.body).cards) : [],
    finish: finishRow ? asObj(finishRow.body) : { summary: "", book_bridge: "" },
  };
  if (keepGoingRow) doc.keep_going = asObj(keepGoingRow.body);
  if (safetyRow) doc.safety_hub = asObj(safetyRow.body);
  for (const k of Object.keys(doc)) if (doc[k] === undefined) delete doc[k];

  // The document was validated against WorkbookV3 at publish time and the
  // internal block was dropped there. Locked units carry no exercise ids, so
  // a strict parse is not run here; the Player reads the shape it needs.
  return { workbook: doc as unknown as WorkbookV3, lockedUnits, missing };
}
