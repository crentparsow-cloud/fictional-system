/**
 * Write the Demo Catalogue v2 preview seed (F-153).
 *
 *   pnpm --filter @akana/seed preview:v2
 *
 * Writes supabase/seed/seed_v2_preview.sql only. It never touches seed.sql,
 * never connects to a database and has no apply option: v2 waits for Crent's
 * approval of the titles.
 */
import { repoRoot } from "./build";
import type { Seed } from "./rows";
import { writeSeedV2Preview } from "./v2";

const root = repoRoot();
const { path, seed } = writeSeedV2Preview({ root });
const counts = (Object.keys(seed) as (keyof Seed)[]).map((k) => `  ${k}: ${seed[k].length}`).join("\n");
console.log(`Seed v2 preview built\n${counts}`);
console.log(`Preview written to ${path.replace(root + "/", "")}. DO NOT APPLY UNTIL CRENT APPROVES.`);
