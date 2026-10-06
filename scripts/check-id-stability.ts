/**
 * Id stability check (F-110).
 *
 *   pnpm tsx scripts/check-id-stability.ts            compare with origin/main
 *   pnpm tsx scripts/check-id-stability.ts <git ref>  compare with any ref
 *
 * Compares every workbook in content/workbooks/v3 with the same file at the
 * ref, using git show. A file that is new since the ref is skipped. A file
 * that existed at the ref and is now gone is a finding. Exits 1 on any finding.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { WorkbookV3 } from "@akana/schema";
import { checkIdStability, formatStabilityFindings } from "@akana/validate";

const ROOT = join(import.meta.dirname, "..");
const DIR = "content/workbooks/v3";
const ref = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "origin/main";

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

try {
  git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
} catch {
  console.error(`Unknown git ref: ${ref}`);
  process.exit(2);
}

const atRef = new Set(
  git(["ls-tree", "--name-only", `${ref}:${DIR}`])
    .split("\n")
    .filter((f) => f.endsWith(".json")),
);
const local = existsSync(join(ROOT, DIR)) ? readdirSync(join(ROOT, DIR)).filter((f) => f.endsWith(".json")) : [];

let total = 0;
let added = 0;

function parse(label: string, text: string): WorkbookV3 | null {
  const r = WorkbookV3.safeParse(JSON.parse(text));
  if (r.success) return r.data;
  console.log(`${label}: does not parse as schema v3; run pnpm validate for details`);
  total++;
  return null;
}

for (const file of [...local].sort()) {
  if (!atRef.has(file)) {
    added++;
    console.log(`${DIR}/${file}: new since ${ref}, skipped`);
    continue;
  }
  const prev = parse(`${ref}:${DIR}/${file}`, git(["show", `${ref}:${DIR}/${file}`]));
  const next = parse(`${DIR}/${file}`, readFileSync(join(ROOT, DIR, file), "utf8"));
  if (!prev || !next) continue;
  const findings = checkIdStability(prev, next);
  total += findings.length;
  console.log(formatStabilityFindings(`${DIR}/${file}`, findings));
}

for (const file of [...atRef].sort()) {
  if (!local.includes(file)) {
    total++;
    console.log(`${DIR}/${file}: WORKBOOK_REMOVED  present at ${ref}, missing now; workbooks are retired, never deleted`);
  }
}

console.log(`\n${local.length} file(s) checked against ${ref}, ${added} new, ${total} finding(s)`);
process.exit(total ? 1 : 0);
