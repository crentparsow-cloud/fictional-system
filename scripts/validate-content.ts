/**
 * Validate every v3 workbook under content/workbooks/v3 and the demo seed.
 *
 *   pnpm validate                  errors fail the run
 *   pnpm validate --lenient        counts and depth become warnings (pilot content)
 *   pnpm validate path/to/file.json [more...]
 *
 * The 20 Maya Vaughn workbooks carry parked content issues (handover item 7).
 * Until Crent clears them, CI runs this with --parked, which reports style,
 * claims and count findings on those files without failing the build. Schema
 * and reference errors always fail.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { validateWorkbook, formatFindings } from "@akana/validate";

const ROOT = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const lenient = args.includes("--lenient");
const parked = args.includes("--parked");
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

let failed = 0;
for (const file of targets) {
  const doc = JSON.parse(readFileSync(file, "utf8")) as { status?: string };
  const result = validateWorkbook(doc, { lenient });
  const isParked = parked && doc.status === "in_review";
  const blocking = isParked ? result.errors.filter((e) => e.category === "schema" || e.category === "refs") : result.errors;
  if (blocking.length) failed++;
  const shown = isParked ? { ...result, ok: blocking.length === 0, errors: blocking, warnings: [...result.warnings, ...result.errors.filter((e) => !blocking.includes(e)).map((e) => ({ ...e, severity: "warning" as const }))] } : result;
  console.log(formatFindings(file.replace(ROOT + "/", ""), shown));
}
console.log(`\n${targets.length} file(s), ${failed} failed`);
process.exit(failed ? 1 : 0);
