/**
 * Validate every workbook under content/workbooks/v3, content/workbooks/classics
 * and content/workbooks/demo. A demo file is checked against the demo profile
 * (packages/validate/src/demo.ts), with its shelf read from the registry.
 *
 *   pnpm validate                  errors fail the run
 *   pnpm validate --lenient        counts and depth become warnings (pilot content)
 *   pnpm validate --style          also run the plain English lint (14.40) over the
 *                                  workbooks and apps/web/messages; findings are
 *                                  warnings and never fail the run
 *   pnpm validate path/to/file.json [more...]
 *
 * Title copy (7.2, 7.3, 12.1): when content/catalog/title-copy.json exists, every
 * entry is checked against the claims and style rules for its shelf, with the
 * length rules for the card line, end state, who-this-is-for lines and letters.
 * Errors fail the run. Plain English findings are warnings and print with --style.
 *
 * The 20 Maya Vaughn workbooks carry parked content issues (handover item 7).
 * Until Crent clears them, CI runs this with --parked, which reports style,
 * claims and count findings on those files without failing the build. Schema
 * and reference errors always fail.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
// Relative import: the default scan list lives beside the validator and reads the disk, so index.ts does not export it.
import { contentTargets, shelfFor } from "../packages/validate/src/targets";
import { validateWorkbook, demoReaderPages, demoReaderWords, formatFindings, checkPlainWorkbook, checkPlainStrings, summarisePlain, checkTitleCopy, titleCopyContext, type CatalogueTitle, type Finding, type PlainFinding } from "@akana/validate";

const ROOT = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const lenient = args.includes("--lenient");
const parked = args.includes("--parked");
const style = args.includes("--style");
const files = args.filter((a) => !a.startsWith("--")).map((a) => resolve(a));

const targets = files.length ? files : contentTargets(ROOT);

if (targets.length === 0) {
  console.log("No workbooks found in content/workbooks/v3 or content/workbooks/classics. Run pnpm migrate:v1 first.");
  process.exit(0);
}

// Plain findings are reported through the same formatter as ordinary warnings.
const asFinding = (p: PlainFinding): Finding => ({ severity: "warning", category: "style", path: p.path, message: `plain: ${p.message}`, excerpt: p.excerpt });

let failed = 0;
const plainAll: PlainFinding[] = [];
for (const file of targets) {
  const doc = JSON.parse(readFileSync(file, "utf8")) as { status?: string; is_demo?: unknown; theme_id?: unknown };
  const result = validateWorkbook(doc, { lenient, shelf: shelfFor(file, doc) });
  const isParked = parked && doc.status === "in_review";
  const blocking = isParked ? result.errors.filter((e) => e.category === "schema" || e.category === "refs") : result.errors;
  if (blocking.length) failed++;
  const plain = style && result.doc ? checkPlainWorkbook(result.doc) : [];
  plainAll.push(...plain);
  const shown = isParked
    ? { ...result, ok: blocking.length === 0, errors: blocking, warnings: [...result.warnings, ...result.errors.filter((e) => !blocking.includes(e)).map((e) => ({ ...e, severity: "warning" as const })), ...plain.map(asFinding)] }
    : { ...result, warnings: [...result.warnings, ...plain.map(asFinding)] };
  console.log(formatFindings(file.replace(ROOT + "/", ""), shown));
  if (result.doc?.is_demo) console.log(`  demo: about ${demoReaderPages(result.doc)} reader pages (${demoReaderWords(result.doc)} words), shelf ${shelfFor(file, doc) ?? "unknown"}`);
}

if (style) {
  const dir = join(ROOT, "apps", "web", "messages");
  const messageFiles = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
  for (const f of messageFiles) {
    const findings = checkPlainStrings(JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>, f);
    plainAll.push(...findings);
    const c = summarisePlain(findings);
    console.log(`plain apps/web/messages/${f}: ${findings.length} finding(s): ${c.long_sentence} long sentence(s), ${c.negative_contraction} negative contraction(s), ${c.banned_word} banned word(s)`);
    for (const x of findings) console.log(`  - ${x.path}: ${x.message}${x.excerpt ? ` : ${JSON.stringify(x.excerpt)}` : ""}`);
  }
  const c = summarisePlain(plainAll);
  console.log(`\nplain English: ${plainAll.length} finding(s) in total: ${c.long_sentence} long sentence(s), ${c.negative_contraction} negative contraction(s), ${c.banned_word} banned word(s), ${c.short_unit_title} short unit title(s)`);
}

// ---------- title copy ----------
const copyPath = join(ROOT, "content", "catalog", "title-copy.json");
if (existsSync(copyPath) && files.length === 0) {
  const entries = JSON.parse(readFileSync(copyPath, "utf8")) as { titles: Array<{ code: string }> };
  const catalogue = JSON.parse(readFileSync(join(ROOT, "docs", "planning", "AK_Demo_Catalogue_v2.json"), "utf8")) as { workbooks: CatalogueTitle[] };
  const byCode = new Map(catalogue.workbooks.map((w) => [w.code, w]));
  let copyErrors = 0;
  let copyWarnings = 0;
  for (const e of entries.titles) {
    const w = byCode.get(e.code);
    if (!w) {
      console.log(`  error title-copy ${e.code}: not in the catalogue`);
      copyErrors++;
      continue;
    }
    for (const f of checkTitleCopy(e, titleCopyContext(w))) {
      if (f.severity === "error") copyErrors++;
      else copyWarnings++;
      if (f.severity === "error" || style) console.log(`  ${f.severity} ${f.path}: ${f.message}${f.excerpt ? ` : ${JSON.stringify(f.excerpt)}` : ""}`);
    }
  }
  console.log(`title copy: ${entries.titles.length} title(s), ${copyErrors} error(s), ${copyWarnings} warning(s)`);
  if (copyErrors) failed++;
}

console.log(`\n${targets.length} file(s), ${failed} failed`);
process.exit(failed ? 1 : 0);
