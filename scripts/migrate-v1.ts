/**
 * Convert the 20 Maya Vaughn v1.0 workbooks to schema v3.0 (F-111).
 *
 *   pnpm migrate:v1                 writes content/workbooks/v3/<id>.json
 *   pnpm migrate:v1 --check         converts in memory and reports only
 *
 * Rules (architecture 6.3):
 *  - exercise and field ids are kept, so answers and AK- codes survive
 *  - topic_name and set_id move to internal; set_id maps to a Theme later
 *  - safety_tier standard or higher becomes the same tier; genre is wellbeing
 *  - structure is 12 weeks with the four named stages
 *  - selfcheck becomes unscored
 *  - source_book.manuscript_file moves to internal, never published
 *  - is_demo false: Maya Vaughn is a real pen name with real books
 *  - status in_review: content issues are parked until Crent clears them
 *
 * AK- codes: the naming board minted 20 codes that are not in the planning
 * folder. Until Crent supplies them, codes are minted here with the documented
 * rule and marked provisional in internal.notes. Replace, do not re-mint.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { mintCode, type V1Workbook, type WorkbookV3Input } from "@akana/schema";
import { validateWorkbook, formatFindings } from "@akana/validate";

const ROOT = join(import.meta.dirname, "..");
const SRC = join(ROOT, "content", "workbooks");
const OUT = join(SRC, "v3");
const CHECK_ONLY = process.argv.includes("--check");

const MAYA_VAUGHN_AUTHOR_ID = "AU-2DA6H"; // AK_Demo_Catalogue.json, maya_vaughn.author_id

interface CatalogBook {
  id: string;
  title: string;
  subtitle: string;
  asin?: { kindle?: string; paperback?: string };
  workbook_id: string;
  topic_set: string;
}
interface CatalogWorkbook {
  id: string;
  name: string;
  book_id: string;
  topic_set: string;
  hue: number;
  status: string;
}
const catalog = JSON.parse(readFileSync(join(ROOT, "content", "catalog", "catalog.json"), "utf8")) as {
  books: CatalogBook[];
  workbooks: CatalogWorkbook[];
  topic_sets: { id: string; name: string }[];
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function convert(v1: V1Workbook): WorkbookV3Input {
  const cw = catalog.workbooks.find((w) => w.id === v1.id);
  const book = catalog.books.find((b) => b.workbook_id === v1.id);
  if (!cw || !book) throw new Error(`catalog has no entry for workbook ${v1.id}`);

  const code = mintCode("AK", `maya-vaughn:${v1.id}`);
  const stageIdByWeek = new Map<number, string>();
  for (const s of v1.stages) for (const w of s.weeks) stageIdByWeek.set(w, s.id);

  const storeLinks: Record<string, string> = {};
  if (book.asin?.kindle) {
    storeLinks.GB = `https://www.amazon.co.uk/dp/${book.asin.kindle}`;
    storeLinks.US = `https://www.amazon.com/dp/${book.asin.kindle}`;
  }

  return {
    schema_version: "3.0",
    code,
    slug: `${slugify(book.title)}-${code.slice(3).toLowerCase()}`,
    title: book.title,
    short_title: cw.name,
    card_line: v1.tagline,
    tagline: v1.tagline,
    book: {
      book_id: book.id,
      title: book.title,
      subtitle: book.subtitle,
      store_links: Object.keys(storeLinks).length ? storeLinks : undefined,
      asin: book.asin?.kindle,
    },
    author: { author_id: MAYA_VAUGHN_AUTHOR_ID, display_name: v1.source_book.author },
    genre: "wellbeing",
    language: "en",
    spelling: "en-US", // Maya Vaughn reader copy is US English (architecture 5.2)
    is_demo: false,
    depth: "full",
    badge: "official",
    status: "in_review",
    safety_tier: v1.safety_tier,
    structure: {
      unit: "week",
      count: 12,
      free_units: 1,
      stages: v1.stages.map((s) => ({
        id: s.id,
        number: s.number,
        name: s.name,
        units: s.weeks,
        primer: s.primer,
        outcome: s.outcome,
        review_question: s.review_question,
      })),
    },
    start: v1.start,
    selfcheck: { ...v1.selfcheck, scored: false },
    checkin: v1.checkin,
    daily_check: v1.daily_check,
    units: v1.weeks.map((w) => ({
      number: w.number,
      stage: w.stage ?? stageIdByWeek.get(w.number),
      focus: w.focus,
      exercise_ids: w.exercise_ids,
      new_toolkit_ids: w.new_toolkit_ids,
      selfcheck: w.selfcheck,
      repeat_ids: w.repeat_ids,
    })),
    exercises: v1.exercises.map((e) => {
      const { repeat_weeks, fields, ...rest } = e;
      return {
        ...rest,
        fields: fields.map((f) => ({ ...f, type: f.type as never })),
        repeat_units: repeat_weeks,
      };
    }),
    toolkit: v1.toolkit,
    milestones: v1.milestones.map((m) => ({
      ...m,
      trigger: m.trigger.replace(/^week_complete:/, "unit_complete:"),
    })),
    plan_sections: v1.plan_sections,
    finish: {
      summary: v1.finish.summary,
      book_bridge: v1.finish.book_bridge,
      related_codes: v1.finish.related_ids,
    },
    keep_going: v1.keep_going,
    safety_hub: v1.safety_hub,
    internal: {
      manuscript_file: v1.source_book.manuscript_file,
      v1_id: v1.id,
      cut_log: v1.cut_log,
      notes: [
        `v1 topic_name: ${v1.topic_name}`,
        `v1 set_id: ${v1.set_id} (${catalog.topic_sets.find((t) => t.id === cw.topic_set)?.name ?? cw.topic_set}); Theme to be assigned from the naming board`,
        `AK code minted provisionally on migration; replace with the naming board code [check]`,
        `catalogue hue: ${cw.hue}`,
      ].join("\n"),
    },
  };
}

function main(): void {
  if (!existsSync(SRC)) {
    console.log(`No v1 workbooks at ${SRC}; nothing to migrate.`);
    return;
  }
  const files = readdirSync(SRC).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
  if (!CHECK_ONLY && !existsSync(OUT)) mkdirSync(OUT);
  let failed = 0;
  const codes = new Set<string>();
  for (const f of files) {
    const v1 = JSON.parse(readFileSync(join(SRC, f), "utf8")) as V1Workbook;
    if (v1.schema_version !== "1.0") continue;
    const v3 = convert(v1);
    if (codes.has(v3.code)) throw new Error(`code collision on ${v3.code}`);
    codes.add(v3.code);
    const result = validateWorkbook(v3, { lenient: true });
    // Structure and reference errors block the migration. Style, claims and
    // count findings are the parked content issues and are reported only.
    const blocking = result.errors.filter((e) => e.category === "schema" || e.category === "refs");
    const parked = result.errors.filter((e) => !blocking.includes(e));
    if (blocking.length) {
      failed++;
      console.log(formatFindings(f, { ...result, errors: blocking, warnings: [] }));
    } else {
      console.log(`OK   ${f} -> ${v3.code} ${v3.slug} (${parked.length} parked content finding(s), ${result.warnings.length} warning(s))`);
    }
    if (!CHECK_ONLY) writeFileSync(join(OUT, f), JSON.stringify(v3, null, 2) + "\n");
  }
  console.log(`\n${files.length} files, ${failed} blocked${CHECK_ONLY ? " (check only, nothing written)" : `, written to ${OUT}`}`);
  process.exit(failed ? 1 : 0);
}

main();
