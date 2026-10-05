/**
 * Build the catalogue seed from the registry, the demo catalogue and the v3
 * workbooks, then write it as SQL or push it to Supabase.
 *
 *   pnpm tsx scripts/seed.ts --sql      write supabase/seed/seed.sql
 *   pnpm tsx scripts/seed.ts --apply    upsert through supabase-js, 200 rows a batch
 *                                       (needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
 *   pnpm tsx scripts/seed.ts            build only and print the row counts
 *
 * Key material is read from the environment and never printed.
 */
import { join } from "node:path";
// Relative import: the root package.json does not list @akana/seed and is not edited here.
import { applySeed, buildSeed, writeSeedSql, type Seed } from "../packages/seed/src/index";

const ROOT = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const wantSql = args.includes("--sql");
const wantApply = args.includes("--apply");

function counts(seed: Seed): string {
  return (Object.keys(seed) as (keyof Seed)[]).map((k) => `  ${k}: ${seed[k].length}`).join("\n");
}

async function main(): Promise<void> {
  const seed = buildSeed({ root: ROOT });
  console.log(`Seed built\n${counts(seed)}`);

  if (wantSql) {
    const out = join(ROOT, "supabase", "seed", "seed.sql");
    writeSeedSql(seed, out);
    console.log(`SQL written to ${out.replace(ROOT + "/", "")}`);
  }

  if (wantApply) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment to apply the seed.");
      process.exit(2);
    }
    const host = new URL(process.env.SUPABASE_URL).host;
    console.log(`Applying to ${host}`);
    await applySeed(seed, { log: (line) => console.log(`  ${line}`) });
    console.log("Seed applied");
  }

  if (!wantSql && !wantApply) console.log("Nothing written. Pass --sql or --apply.");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
