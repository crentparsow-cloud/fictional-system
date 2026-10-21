/**
 * Validate, version and publish workbook content in one command (10.10).
 *
 *   pnpm content:publish --to staging
 *   pnpm content:publish --to staging --dry-run
 *   pnpm content:publish --to production --yes
 *
 * Steps: validate every file under content/workbooks (v3 and classics), check
 * the classic gates, build the rows, compare content hashes with the target,
 * then apply through the seed's own path. Statuses are insert-only, so a title
 * already live stays live, and a classic goes in at its catalogue status
 * (in_review) and is never set live here.
 *
 * Each target reads its own variables so one cannot stand in for the other:
 *   STAGING_SUPABASE_URL, STAGING_SUPABASE_SERVICE_ROLE_KEY
 *   PRODUCTION_SUPABASE_URL, PRODUCTION_SUPABASE_SERVICE_ROLE_KEY
 * Key material is read from the environment and never printed.
 * Docs: docs/content/CLASSICS_PIPELINE.md.
 */
import { join } from "node:path";
import { PublishRefused, runPublish, type PublishTarget } from "../packages/seed/src/index";

const ROOT = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const toIndex = args.indexOf("--to");
const to = toIndex >= 0 ? args[toIndex + 1] : undefined;

if (to !== "staging" && to !== "production") {
  console.error("Usage: pnpm content:publish --to staging|production [--dry-run] [--yes]");
  process.exit(2);
}

runPublish({ root: ROOT, to: to as PublishTarget, yes: flag("yes"), dryRun: flag("dry-run"), log: (line) => console.log(line) })
  .then((r) => process.exit(r.dryRun || r.applied ? 0 : 1))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(err instanceof PublishRefused ? 2 : 1);
  });
