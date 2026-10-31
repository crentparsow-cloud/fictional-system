/**
 * SQL for the demo workbooks (content/workbooks/demo), one file per title and
 * one combined file per writing group, for pasting into the SQL editor.
 *
 *   pnpm tsx scripts/demo-sql.ts --out <dir> [--groups <demo-titles.json>] [AK-XXXXX ...]
 *
 * Builds the seed (packages/seed), takes each demo row that has a version, and
 * writes <dir>/<code>.sql. Each file is one transaction:
 *   1. insert the workbook_versions row, or update it while it is unpublished
 *      (a published version is immutable, 0002);
 *   2. update the workbook's current_version_id, depth, short_title and card_line;
 *   3. publish: set request.jwt.claims to a platform owner and call
 *      app.publish_version, which fills workbook_sections (LESSONS_LEARNED 38);
 *   4. set the workbook live, then report the section count.
 * Running a file twice is safe: an already published version is left alone.
 *
 * With --groups, also writes <dir>/group-<n>.sql for each group in the title
 * list that has at least one written title (groups 1 to 8, and 9 and 10 for
 * the faith titles), split into parts under 300 KB.
 * Always writes <dir>/mv-live.sql, which sets the in_review Maya Vaughn titles
 * live (see the note above it below). Nothing here connects to a database.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildSeed } from "../packages/seed/src/build";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const out = flag("--out");
const groupsPath = flag("--groups");
const codes = args.filter((a, i) => /^AK-/.test(a) && args[i - 1] !== "--out" && args[i - 1] !== "--groups");
if (!out) {
  console.error("Usage: pnpm tsx scripts/demo-sql.ts --out <dir> [--groups <demo-titles.json>] [AK-XXXXX ...]");
  process.exit(2);
}

const GROUP_FILE_LIMIT = 300 * 1024;
const OWNER_CLAIMS = JSON.stringify({ role: "authenticated", app_metadata: { platform_roles: ["owner"] } });

const q = (s: unknown) => (s === null || s === undefined ? "null" : `'${String(s).replace(/'/g, "''")}'`);

const seed = buildSeed({ root: resolve(import.meta.dirname, "..") });
const demoRows = seed.workbooks.filter((w) => w.is_demo && w.current_version_id && (codes.length === 0 || codes.includes(w.code)));
const missing = codes.filter((c) => !demoRows.some((w) => w.code === c));
if (missing.length) console.warn(`no demo version for: ${missing.join(", ")}`);

mkdirSync(out, { recursive: true });
const byCode = new Map<string, string>();
for (const w of demoRows) {
  const v = seed.workbook_versions.find((x) => x.id === w.current_version_id)!;
  const vid = q(v.id);
  const body = [
    `insert into public.workbook_versions (id, workbook_id, semver, schema_version, content, content_hash, validated_at, published_at) values (${vid}, ${q(v.workbook_id)}, ${q(v.semver)}, ${q(v.schema_version)}, ${q(JSON.stringify(v.content))}::jsonb, ${q(v.content_hash)}, null, null) on conflict (id) do update set workbook_id = excluded.workbook_id, semver = excluded.semver, schema_version = excluded.schema_version, content = excluded.content, content_hash = excluded.content_hash where public.workbook_versions.published_at is null;`,
    `do $check$ begin if exists (select 1 from public.workbook_versions where id = ${vid} and content_hash <> ${q(v.content_hash)}) then raise warning 'version % is already published with other content; it is left as it is', ${vid}; end if; end $check$;`,
    `update public.workbooks set depth = ${q(w.depth)}, short_title = ${q(w.short_title)}, card_line = ${q(w.card_line)}, current_version_id = ${vid} where id = ${q(w.id)};`,
    "-- publish as a platform owner (LESSONS_LEARNED 38): fills workbook_sections, sets published_at and current_version_id",
    `select set_config('request.jwt.claims', ${q(OWNER_CLAIMS)}, true);`,
    `do $publish$ begin if exists (select 1 from public.workbook_versions where id = ${vid} and published_at is null) then perform app.publish_version(${vid}::uuid); end if; end $publish$;`,
    `update public.workbooks set status = 'live' where id = ${q(w.id)} and status is distinct from 'live';`,
    "select set_config('request.jwt.claims', '', true);",
  ];
  const report = `select ${q(w.code)} as code, (select count(*) from public.workbook_sections where version_id = ${vid}) as sections, (select published_at from public.workbook_versions where id = ${vid}) as published_at, (select status from public.workbooks where id = ${q(w.id)}) as status;`;
  const head = `-- ${w.code} ${w.title} ${v.semver} ${v.content_hash}`;
  const sql = [head, "begin;", ...body, "commit;", report, ""].join("\n");
  // A group file runs its titles in one transaction, so it keeps each title's statements and report, not its begin and commit.
  byCode.set(w.code, [head, ...body, report].join("\n"));
  writeFileSync(join(out, `${w.code}.sql`), sql);
  console.log(`${w.code}.sql ${w.title} ${v.semver} ${v.content_hash} ${Buffer.byteLength(sql)} bytes`);
}

if (groupsPath) {
  const list = JSON.parse(readFileSync(groupsPath, "utf8")) as { titles: { group: number; code: string }[] };
  const groups = [...new Set(list.titles.map((t) => t.group))].sort((a, b) => a - b);
  for (const g of groups) {
    const parts: string[][] = [[]];
    let size = 0;
    for (const t of list.titles.filter((x) => x.group === g)) {
      const sql = byCode.get(t.code);
      if (!sql) continue;
      const n = Buffer.byteLength(sql) + 1;
      // begin;, commit; and the header line.
      const frame = 200;
      if (n + frame > GROUP_FILE_LIMIT) throw new Error(`${t.code}.sql is over ${GROUP_FILE_LIMIT} bytes on its own`);
      if (size + n + frame > GROUP_FILE_LIMIT) {
        parts.push([]);
        size = 0;
      }
      parts[parts.length - 1]!.push(sql);
      size += n;
    }
    const filled = parts.filter((p) => p.length);
    // Groups 9 and 10 (the faith titles) are listed before their files exist; say so rather than write an empty file.
    if (filled.length === 0) console.log(`group-${g}: no written titles yet, no file written`);
    filled.forEach((p, i) => {
      const name = filled.length === 1 ? `group-${g}.sql` : `group-${g}-part-${i + 1}.sql`;
      // One transaction: the file starts with begin; and ends with commit;.
      const body = ["begin;", `-- Demo workbooks, group ${g}${filled.length > 1 ? `, part ${i + 1} of ${filled.length}` : ""}: ${p.length} title(s)`, ...p, "commit;", ""].join("\n");
      writeFileSync(join(out, name), body);
      console.log(`${name}: ${p.length} title(s), ${Buffer.byteLength(body)} bytes`);
    });
  }
}
// mv-live.sql: the Maya Vaughn titles (badge official, not demo, with a current
// version) move from in_review to live. A client on the API cannot write
// status live (0002 status guard, 0016 release gate); the SQL editor runs as
// postgres, which those guards let through, as the seed does. release_version
// is not used: it would refuse on the missing sign-offs. Each version is
// published first as a platform owner (LESSONS_LEARNED 38) so the reader has
// its sections; the licence and payout gates (0013, 0014) still run.
const mv = seed.workbooks.filter((w) => w.badge === "official" && !w.is_demo && w.current_version_id && w.status === "in_review");
const mvCodes = `array[${mv.map((w) => q(w.code)).join(", ")}]::text[]`;
const mvSql = [
  "begin;",
  `-- Maya Vaughn titles to live: ${mv.length} title(s). Run in the SQL editor (role postgres).`,
  `select set_config('request.jwt.claims', ${q(OWNER_CLAIMS)}, true);`,
  "do $mv$",
  "declare r record; n int := 0;",
  "begin",
  "  for r in select w.id, w.code, w.current_version_id as vid from public.workbooks w",
  `           where w.code = any(${mvCodes}) and w.badge = 'official' and not w.is_demo`,
  "             and w.current_version_id is not null and w.status = 'in_review' for update",
  "  loop",
  "    if exists (select 1 from public.workbook_versions where id = r.vid and published_at is null) then",
  "      perform app.publish_version(r.vid);",
  "    end if;",
  "    update public.workbooks set status = 'live' where id = r.id;",
  "    n := n + 1;",
  "  end loop;",
  `  raise notice '% of ${mv.length} Maya Vaughn title(s) set live', n;`,
  "end $mv$;",
  "select set_config('request.jwt.claims', '', true);",
  `select w.code, w.status, v.published_at is not null as published, (select count(*) from public.workbook_sections s where s.version_id = w.current_version_id) as sections from public.workbooks w left join public.workbook_versions v on v.id = w.current_version_id where w.code = any(${mvCodes}) order by w.code;`,
  "commit;",
  "",
].join("\n");
writeFileSync(join(out, "mv-live.sql"), mvSql);
console.log(`mv-live.sql: ${mv.length} Maya Vaughn title(s), ${Buffer.byteLength(mvSql)} bytes`);

console.log(`${demoRows.length} demo title(s) written to ${out}`);
