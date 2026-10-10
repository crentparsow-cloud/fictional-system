/**
 * Check a classic's source text before workbook work starts (14.41).
 * The steps are in docs/content/CLASSICS_PIPELINE.md.
 *
 *   pnpm tsx scripts/classics-source-check.ts <source.txt> --code AK-FN9KB
 *   pnpm tsx scripts/classics-source-check.ts <source.txt> --edition "..." --published 1862 --died 180,1879
 *   pnpm tsx scripts/classics-source-check.ts <source.txt> --code AK-FN9KB --write out/meditations.txt
 *   pnpm tsx scripts/classics-source-check.ts <modernised.txt> --revert out/meditations.log.json
 *
 * Reports: the source edition named, the copyright and date check (published
 * before 1931, and every contributor dead more than 70 full years under the
 * UK rule), a scan quality check, and a reversible modernisation log.
 * --code reads the edition and the people from the house record JSON in
 * content/public-domain. --write saves the modernised text and a .log.json
 * beside it; --revert applies a log backwards and prints the original.
 *
 * Exit 1 when the copyright check is not clear or the scan is suspect.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { checkCopyright, checkScanQuality, modernise, revert, stripGutenbergBoilerplate, type ModernisationEntry, type Person } from "@akana/validate";

const ROOT = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const file = args.find((a, i) => !a.startsWith("--") && (i === 0 || !args[i - 1]!.startsWith("--")));
if (!file) {
  console.error("Usage: classics-source-check <source.txt> [--code AK-XXXXX | --edition NAME --published YEAR --died Y1,Y2] [--write out.txt] [--revert log.json]");
  process.exit(2);
}
const raw = readFileSync(file, "utf8");

const revertLog = opt("revert");
if (revertLog) {
  const log = JSON.parse(readFileSync(revertLog, "utf8")) as ModernisationEntry[];
  process.stdout.write(revert(raw, log));
  process.exit(0);
}

// 1. Edition
let edition = opt("edition");
let published = opt("published") ? Number(opt("published")) : undefined;
let people: Person[] = (opt("died") ?? "")
  .split(",")
  .filter(Boolean)
  .map((y, i) => ({ name: `contributor ${i + 1}`, role: "unknown", died: Number(y) }));
const code = opt("code");
if (code) {
  const recordPath = join(ROOT, "content", "public-domain", `${code}.json`);
  if (!existsSync(recordPath)) {
    console.error(`No house record at ${recordPath}. Write the record first (docs/public-domain/${code}.md and its JSON twin).`);
    process.exit(2);
  }
  const record = JSON.parse(readFileSync(recordPath, "utf8")) as { edition?: { name?: string }; firstPublished?: string; people?: Person[] };
  edition ??= record.edition?.name;
  published ??= Number(/\b(\d{3,4})\b/.exec(record.firstPublished ?? "")?.[1]) || undefined;
  if (people.length === 0 && record.people) people = record.people;
}
const lines: string[] = [];
lines.push(`Source file: ${file}`);
lines.push(edition ? `Edition: ${edition}` : "Edition: NOT NAMED. Name the exact edition and its URL before going on.");

// 2. Copyright
const cr = checkCopyright({ published, people });
lines.push(`Published before ${1931}: ${cr.publishedBefore1931}${published ? ` (${published})` : ""}`);
lines.push(`UK life plus 70: ${cr.ukLifePlus70}${cr.ukTermEnds ? ` (term ran to the end of ${cr.ukTermEnds})` : ""}`);
for (const p of people) lines.push(`  ${p.name} (${p.role}): died ${p.died ?? "UNKNOWN"}`);
if (cr.missingDeathYears.length) lines.push(`  Missing death years: ${cr.missingDeathYears.join(", ")}`);
lines.push(`Copyright: ${cr.clear ? "clear" : "NOT CLEAR"}`);

// 3. Scan quality, on the body without the Gutenberg boilerplate
const stripped = stripGutenbergBoilerplate(raw);
const body = stripped.text;
const q = checkScanQuality(body);
lines.push(`Gutenberg boilerplate: ${stripped.stripped ? "stripped" : "not found"}`);
lines.push(`Scan: ${q.chars} characters, ${q.unusual} unusual (${(q.ratio * 100).toFixed(3)} percent), ${q.replacementChars} replacement character(s), ${q.digitsInWords} digit(s) inside words: ${q.suspect ? "SUSPECT" : "ok"}`);

// 4. Modernisation
const mod = modernise(body);
const byNote = new Map<string, number>();
for (const e of mod.log) byNote.set(e.note, (byNote.get(e.note) ?? 0) + 1);
lines.push(`Modernisation: ${mod.log.length} change(s)`);
for (const [note, n] of [...byNote.entries()].sort((a, b) => b[1] - a[1])) lines.push(`  ${n} x ${note}`);

const out = opt("write");
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, mod.text);
  const logPath = out.replace(/\.txt$/, "") + ".log.json";
  writeFileSync(logPath, JSON.stringify(mod.log, null, 2) + "\n");
  lines.push(`Written: ${out} and ${logPath}`);
}

console.log(lines.join("\n"));
process.exit(cr.clear && !q.suspect ? 0 : 1);
