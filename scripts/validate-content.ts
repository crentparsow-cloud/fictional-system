/**
 * Validate every v3 workbook under content/workbooks/v3 and the demo seed.
 *
 *   pnpm validate                  errors fail the run
 *   pnpm validate --lenient        counts and depth become warnings (pilot content)
 *   pnpm validate --style          also run the plain English lint (14.40) over the
 *                                  workbooks and apps/web/messages; findings are
 *                                  warnings and never fail the run
 *   pnpm validate path/to/file.json [more...]
 *
 * The 20 Maya Vaughn workbooks carry parked content issues (handover item 7).
 * Until Crent clears them, CI runs this with --parked, which reports style,
 * claims and count findings on those files without failing the build. Schema
 * and reference errors always fail.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { validateWorkbook, formatFindings, checkPlainWorkbook, checkPlainStrings, summarisePlain, type Finding, type PlainFinding } from "@akana/validate";

const ROOT = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const lenient = args.includes("--lenient");
const parked = args.includes("--parked");
const style = args.includes("--style");
const files = args.filter((a) => !a.startsWith("--"));

const targets = files.length
  ? files
  : [join(ROOT, "content", "workbooks", "v3")]
      .filter(existsSync)
      .flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => join(dir, f)));

if (targets.length === 0) {
  console.log("No v3 workbooks found. Run pnpm migrate:v1 first.");
  process.exit(0);
}

// Plain findings are reported through the same formatter as ordinary warnings.
const asFinding = (p: PlainFinding): Finding => ({ severity: "warning", category: "style", path: p.path, message: `plain: ${p.message}`, excerpt: p.excerpt });

let failed = 0;
const plainAll: PlainFinding[] = [];
for (const file of targets) {
  const doc = JSON.parse(readFileSync(file, "utf8")) as { status?: string };
  const result = validateWorkbook(doc, { lenient });
  const isParked = parked && doc.status === "in_review";
  const blocking = isParked ? result.errors.filter((e) => e.category === "schema" || e.category === "refs") : result.errors;
  if (blocking.length) failed++;
  const plain = style && result.doc ? checkPlainWorkbook(result.doc) : [];
  plainAll.push(...plain);
  const shown = isParked
    ? { ...result, ok: blocking.length === 0, errors: blocking, warnings: [...result.warnings, ...result.errors.filter((e) => !blocking.includes(e)).map((e) => ({ ...e, severity: "warning" as const })), ...plain.map(asFinding)] }
    : { ...result, warnings: [...result.warnings, ...plain.map(asFinding)] };
  console.log(formatFindings(file.replace(ROOT + "/", ""), shown));
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

console.log(`\n${targets.length} file(s), ${failed} failed`);
process.exit(failed ? 1 : 0);
