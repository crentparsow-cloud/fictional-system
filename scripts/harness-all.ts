/**
 * Parity harness over the whole catalogue (T3).
 *
 *   pnpm tsx scripts/harness-all.ts
 *
 * The 20 Maya Vaughn workbooks have full v3 files in content/workbooks/v3, so
 * every screen of each is rendered to static markup through the engine's
 * renderAll. The 50 demo titles exist only as catalogue entries (title,
 * weeks, a three-line outline) in docs/planning/AK_Demo_Catalogue.json, the
 * file the seed reads them from. They get a listing-only stand-in and the
 * row says there is no content to draw. content/catalog/catalog.json lists
 * the same 20 Maya Vaughn titles as the v3 folder, so it is used to check
 * that each of those has a file.
 *
 * Prints a table and writes it to docs/reports/harness-<date>.md. Exits 1 on
 * any render failure or on a catalogue title with no v3 file.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { WorkbookV3, stripInternal } from "@akana/schema";

const ROOT = join(import.meta.dirname, "..");
const REPORT_DATE = "2026-10-08";

interface Row {
  code: string;
  title: string;
  depth: string;
  source: "v3" | "listing";
  rendered: number;
  failures: number;
  pending: number;
  note: string;
}

interface DemoEntry {
  code: string;
  title: string;
  depth: string;
  weeks?: number;
  outline?: string[];
}

/** What the harness knows about a title with no content: enough for a listing, nothing to render. */
interface ListingStandIn {
  code: string;
  title: string;
  depth: string;
  outline: string[];
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

async function main(): Promise<void> {
  // tsx compiles the engine's .tsx with the classic JSX transform here (there is
  // no root tsconfig to say react-jsx), so the screens expect a global React.
  // Use the engine's own copy so react-dom/server sees the same instance.
  const engineRequire = createRequire(join(ROOT, "packages", "engine", "package.json"));
  (globalThis as { React?: unknown }).React = engineRequire("react");
  // Relative import: the root package.json does not list @akana/engine and is not edited here.
  const { renderAll } = await import("../packages/engine/src/harness");

  const v3Dir = join(ROOT, "content", "workbooks", "v3");
  const files = readdirSync(v3Dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const docs = files.map((f) => ({ file: f, doc: WorkbookV3.parse(stripInternal(readJson(join(v3Dir, f)) as Record<string, unknown>)) }));

  const rows: Row[] = [];
  const problems: string[] = [];

  for (const { file, doc } of docs) {
    const r = renderAll([doc]);
    for (const f of r.failures) problems.push(`${doc.code} ${f.screen}${f.field ? ` field ${f.field}` : ""}: ${f.error}`);
    rows.push({
      code: doc.code,
      title: doc.title,
      depth: doc.depth,
      source: "v3",
      rendered: r.rendered,
      failures: r.failures.length,
      pending: r.pending,
      note: r.failures.length ? "failed" : `rendered (${file})`,
    });
  }

  // The Maya Vaughn catalogue must have a v3 file for every workbook it lists.
  const catalog = readJson(join(ROOT, "content", "catalog", "catalog.json")) as { workbooks: { id: string }[] };
  const v3Ids = new Set(files.map((f) => f.replace(/\.json$/, "")));
  for (const w of catalog.workbooks) {
    if (!v3Ids.has(w.id)) problems.push(`catalog.json lists "${w.id}" but content/workbooks/v3/${w.id}.json is missing`);
  }

  const demo = readJson(join(ROOT, "docs", "planning", "AK_Demo_Catalogue.json")) as { workbooks: DemoEntry[] };
  const standIns: ListingStandIn[] = demo.workbooks.map((w) => ({ code: w.code, title: w.title, depth: w.depth, outline: w.outline ?? [] }));
  for (const s of [...standIns].sort((a, b) => a.code.localeCompare(b.code))) {
    rows.push({
      code: s.code,
      title: s.title,
      depth: `${s.depth} (planned)`,
      source: "listing",
      rendered: 0,
      failures: 0,
      pending: 0,
      note: `listing only, no content to draw${s.outline.length ? ` (outline ${s.outline.length} lines)` : ""}`,
    });
  }

  const v3Rows = rows.filter((r) => r.source === "v3");
  const totals = {
    workbooks: rows.length,
    rendered: v3Rows.length,
    listingOnly: rows.length - v3Rows.length,
    screens: v3Rows.reduce((n, r) => n + r.rendered, 0),
    failures: v3Rows.reduce((n, r) => n + r.failures, 0),
    pending: v3Rows.reduce((n, r) => n + r.pending, 0),
  };

  const header = "| Workbook | Title | Depth | Screens rendered | Failures | Pending fields | Note |";
  const rule = "|---|---|---|---:|---:|---:|---|";
  const lines = rows.map((r) => `| ${r.code} | ${r.title.replace(/\|/g, "/")} | ${r.depth} | ${r.rendered} | ${r.failures} | ${r.pending} | ${r.note} |`);

  const summary = [
    `Workbooks: ${totals.workbooks}. Rendered from v3: ${totals.rendered}. Listing only: ${totals.listingOnly}.`,
    `Screens rendered: ${totals.screens}. Failures: ${totals.failures}. Pending fields: ${totals.pending}.`,
    problems.length ? `Problems: ${problems.length}.` : "Problems: none.",
  ];

  console.log([header, rule, ...lines].join("\n"));
  console.log("");
  console.log(summary.join("\n"));
  for (const p of problems) console.error(`  ${p}`);

  const report = [
    `# Parity harness, ${REPORT_DATE}`,
    "",
    "Generated by `pnpm tsx scripts/harness-all.ts`. Every screen of each v3 workbook is rendered to static markup: Start, each unit in full and short mode, each exercise in both modes, Toolkit, daily check, both check-in lengths, self-check, Finish and Keep going. Pending fields are week 3 placeholder types; they count as a pass.",
    "",
    "The 50 demo titles have no v3 content yet. Their rows come from the demo catalogue (docs/planning/AK_Demo_Catalogue.json) and are listing-only stand-ins with nothing to draw. Their depth is the planned depth from that catalogue.",
    "",
    ...summary,
    "",
    header,
    rule,
    ...lines,
    "",
    ...(problems.length ? ["## Problems", "", ...problems.map((p) => `- ${p}`), ""] : []),
  ].join("\n");

  const outDir = join(ROOT, "docs", "reports");
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `harness-${REPORT_DATE}.md`);
  writeFileSync(out, report);
  console.log(`Report written to ${out.replace(ROOT + "/", "")}`);

  if (problems.length) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
