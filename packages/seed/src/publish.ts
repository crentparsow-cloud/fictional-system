import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { checkCopyright } from "@akana/validate";
// Relative import: targets.ts reads the disk, so @akana/validate does not export it.
import { contentTargets, validateTargets } from "../../validate/src/targets";
import { applySeed, clientFromEnv, type ApplyReport } from "./apply";
import { buildSeed, CLASSIC_SEED_STATUSES, ids } from "./build";
import type { Seed, WorkbookRow, WorkbookVersionRow } from "./rows";

/**
 * The content pipeline (10.10): validate, version, build the rows, apply.
 *
 *   pnpm content:publish --to staging
 *   pnpm content:publish --to production --yes
 *   pnpm content:publish --to staging --dry-run
 *
 * Everything here is plain functions with the database injected, so the dry
 * run and the planning are tested without a connection. The apply step is the
 * seed's own applySeed, so the insert-only status rule is the seed's rule: a
 * title already in the database keeps the status it has, and a classic is
 * never published as live by this command.
 */

export type PublishTarget = "staging" | "production";

export interface ExistingWorkbook {
  status: string;
  current_version_id: string | null;
}
export interface ExistingVersion {
  id: string;
  workbook_id: string;
  semver: string;
  content_hash: string;
}
/** What the target database already holds for the workbooks in this seed. */
export interface DbSnapshot {
  workbooks: Map<string, ExistingWorkbook>;
  versions: ExistingVersion[];
}

export const EMPTY_SNAPSHOT: DbSnapshot = { workbooks: new Map(), versions: [] };

export type PlanAction = "new" | "unchanged" | "changed" | "held";
export interface PlanEntry {
  code: string;
  title: string;
  action: PlanAction;
  semver: string;
  /** For changed: the semver it replaces. */
  from?: string;
  reason?: string;
}

/** Statuses at which a title may be in front of readers. Their pointer is never moved by this command. */
const RELEASED = new Set(["approved", "live", "paused"]);

export function bumpPatch(semver: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(semver);
  if (!m) throw new Error(`semver ${semver} is not x.y.z`);
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

/**
 * Compare the built seed with the database and decide, per written workbook,
 * whether its version is new, unchanged, changed or held. Versions are keyed by
 * content hash: identical content is never written twice, and changed content
 * for a title not yet released gets the next patch version beside the old one.
 * Changed content for a released title is held, because release goes through
 * public.release_version (0016). Rows without content in this seed keep the
 * pointer they have in the database.
 */
export function planPublish(seed: Seed, db: DbSnapshot): { seed: Seed; entries: PlanEntry[] } {
  const entries: PlanEntry[] = [];
  const versionsOut: WorkbookVersionRow[] = [];
  const workbooks: WorkbookRow[] = seed.workbooks.map((w) => ({ ...w }));
  const byWorkbook = new Map<string, WorkbookVersionRow[]>();
  for (const v of seed.workbook_versions) byWorkbook.set(v.workbook_id, [...(byWorkbook.get(v.workbook_id) ?? []), v]);

  for (const w of workbooks) {
    const mine = byWorkbook.get(w.id) ?? [];
    const existing = db.workbooks.get(w.id);
    const have = db.versions.filter((v) => v.workbook_id === w.id);
    if (mine.length === 0) {
      // No content in this build: do not null a pointer the database already has.
      if (existing?.current_version_id) w.current_version_id = existing.current_version_id;
      continue;
    }
    for (const v of mine) {
      const sameId = have.find((h) => h.id === v.id);
      const sameHash = have.find((h) => h.content_hash === v.content_hash);
      const title = w.title;
      if (sameId && sameId.content_hash === v.content_hash) {
        versionsOut.push(v);
        entries.push({ code: w.code, title, action: "unchanged", semver: v.semver });
      } else if (sameHash) {
        // The same content already sits under another version: point at that one.
        w.current_version_id = sameHash.id;
        entries.push({ code: w.code, title, action: "unchanged", semver: sameHash.semver });
      } else if (have.length === 0) {
        versionsOut.push(v);
        entries.push({ code: w.code, title, action: "new", semver: v.semver });
      } else if (existing && RELEASED.has(existing.status)) {
        w.current_version_id = existing.current_version_id;
        entries.push({
          code: w.code,
          title,
          action: "held",
          semver: v.semver,
          reason: `status is ${existing.status}; release the new content through release_version`,
        });
      } else {
        let semver = v.semver;
        const taken = new Set(have.map((h) => h.semver));
        while (taken.has(semver) || (sameId && semver === v.semver)) semver = bumpPatch(semver);
        const id = ids.version(w.code, semver);
        versionsOut.push({ ...v, id, semver });
        w.current_version_id = id;
        entries.push({ code: w.code, title, action: "changed", semver, from: have.map((h) => h.semver).sort().pop() });
      }
    }
  }
  return { seed: { ...seed, workbooks, workbook_versions: versionsOut }, entries };
}

// ---------- gates ----------

export interface GateProblem {
  file: string;
  message: string;
}

/**
 * The classic gates that can be checked without a person: the file passed the
 * validator (done elsewhere), carries only a draft or in_review status, names
 * its house record, and the record's dates clear the copyright test. The
 * reviewer and the signer (steps 7 and 8 of docs/content/CLASSICS_PIPELINE.md)
 * stay human; this command never moves a classic past in_review.
 */
export function gateClassics(root: string, files: string[], asOf?: number): GateProblem[] {
  const problems: GateProblem[] = [];
  for (const file of files) {
    const name = relative(root, file);
    const doc = JSON.parse(readFileSync(file, "utf8")) as { code?: string; status?: string; licence_ref?: string };
    const code = doc.code ?? "";
    if (!(CLASSIC_SEED_STATUSES as readonly string[]).includes(doc.status ?? "")) {
      problems.push({ file: name, message: `status "${doc.status ?? ""}" is not allowed for a classic; only draft or in_review are published` });
    }
    const recordPath = join(root, "content", "public-domain", `${code}.json`);
    if (!existsSync(recordPath)) {
      problems.push({ file: name, message: `no house record at content/public-domain/${code}.json` });
      continue;
    }
    if (doc.licence_ref !== `public-domain:/public-domain/${code}`) {
      problems.push({ file: name, message: `licence_ref should be public-domain:/public-domain/${code}` });
    }
    const record = JSON.parse(readFileSync(recordPath, "utf8")) as { people?: { name: string; role: string; died?: number }[]; firstPublished?: string };
    const published = Number(/\b(\d{3,4})\b/.exec(record.firstPublished ?? "")?.[1]) || undefined;
    const cr = checkCopyright({ published, people: record.people ?? [], asOf });
    if (!cr.clear) problems.push({ file: name, message: "copyright check is not clear in the house record" });
  }
  return problems;
}

// ---------- target ----------

export interface TargetCredentials {
  url: string;
  serviceRoleKey: string;
  host: string;
}

/** Each target reads its own pair of variables, so staging can never be pointed at production by a stray default. */
export function targetCredentials(to: PublishTarget, env: NodeJS.ProcessEnv): TargetCredentials | null {
  const prefix = to === "production" ? "PRODUCTION" : "STAGING";
  const url = env[`${prefix}_SUPABASE_URL`];
  const serviceRoleKey = env[`${prefix}_SUPABASE_SERVICE_ROLE_KEY`];
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey, host: new URL(url).host };
}

export async function readSnapshot(creds: TargetCredentials, seed: Seed): Promise<DbSnapshot> {
  const client = clientFromEnv({ url: creds.url, serviceRoleKey: creds.serviceRoleKey });
  const workbooks = new Map<string, ExistingWorkbook>();
  const versions: ExistingVersion[] = [];
  const idsList = seed.workbooks.map((w) => w.id);
  for (let i = 0; i < idsList.length; i += 100) {
    const batch = idsList.slice(i, i + 100);
    const a = await client.from("workbooks").select("id, status, current_version_id").in("id", batch);
    if (a.error) throw new Error(`workbooks lookup: ${a.error.message}`);
    for (const r of (a.data ?? []) as { id: string; status: string; current_version_id: string | null }[]) {
      workbooks.set(r.id, { status: r.status, current_version_id: r.current_version_id });
    }
    const b = await client.from("workbook_versions").select("id, workbook_id, semver, content_hash").in("workbook_id", batch);
    if (b.error) throw new Error(`workbook_versions lookup: ${b.error.message}`);
    versions.push(...((b.data ?? []) as ExistingVersion[]));
  }
  return { workbooks, versions };
}

// ---------- the run ----------

export interface PublishOptions {
  root: string;
  to: PublishTarget;
  /** Required to write to production. */
  yes?: boolean;
  /** Validate, plan and log, write nothing. */
  dryRun?: boolean;
  env?: NodeJS.ProcessEnv;
  log?: (line: string) => void;
  /** Injected in tests. */
  deps?: {
    snapshot?: (creds: TargetCredentials, seed: Seed) => Promise<DbSnapshot>;
    apply?: (seed: Seed, creds: TargetCredentials, log: (line: string) => void) => Promise<ApplyReport[]>;
  };
}

export interface PublishResult {
  dryRun: boolean;
  applied: boolean;
  entries: PlanEntry[];
  counts: Record<string, number>;
  /** True when no database was read, so every version is reported as new. */
  assumedEmpty: boolean;
}

export class PublishRefused extends Error {}

export async function runPublish(opts: PublishOptions): Promise<PublishResult> {
  const log = opts.log ?? (() => undefined);
  const env = opts.env ?? process.env;
  const dryRun = Boolean(opts.dryRun);
  if (opts.to !== "staging" && opts.to !== "production") throw new PublishRefused("--to must be staging or production");
  if (opts.to === "production" && !dryRun && !opts.yes) {
    throw new PublishRefused("Publishing to production needs an explicit --yes. Run with --dry-run first to see what would change.");
  }

  // 1. Validate. In-review files fail only on schema and reference errors, as in CI.
  const files = contentTargets(opts.root);
  if (files.length === 0) throw new PublishRefused("No workbook files found under content/workbooks.");
  const results = validateTargets(files, { parked: true });
  const failed = results.filter((r) => !r.ok);
  for (const r of failed) {
    log(`FAIL ${relative(opts.root, r.file)}`);
    for (const f of r.blocking.slice(0, 5)) log(`  ${f.category} ${f.path}: ${f.message}`);
  }
  if (failed.length) throw new PublishRefused(`Validation failed for ${failed.length} file(s). Nothing was published.`);
  log(`validated ${results.length} file(s), ${results.reduce((n, r) => n + r.warnings.length, 0)} warning(s)`);

  // 2. Classic gates.
  const classicFilesList = files.filter((f) => f.includes(`${join("content", "workbooks", "classics")}`));
  const gate = gateClassics(opts.root, classicFilesList);
  for (const g of gate) log(`GATE ${g.file}: ${g.message}`);
  if (gate.length) throw new PublishRefused(`${gate.length} classic gate problem(s). Nothing was published.`);
  if (classicFilesList.length) log(`classics gate passed for ${classicFilesList.length} file(s); they go in at their catalogue status and are never set live`);

  // 3. Build the rows, 4. version against the target.
  const built = buildSeed({ root: opts.root });
  const creds = targetCredentials(opts.to, env);
  if (!creds && !dryRun) {
    const p = opts.to.toUpperCase();
    throw new PublishRefused(`Set ${p}_SUPABASE_URL and ${p}_SUPABASE_SERVICE_ROLE_KEY to publish to ${opts.to}.`);
  }
  if (creds && opts.to === "staging") {
    const prod = targetCredentials("production", env);
    if (prod && prod.host === creds.host) throw new PublishRefused("Staging and production point at the same database. Fix the variables.");
  }
  let snapshot = EMPTY_SNAPSHOT;
  let assumedEmpty = true;
  if (creds) {
    snapshot = await (opts.deps?.snapshot ?? readSnapshot)(creds, built);
    assumedEmpty = false;
    log(`target ${opts.to}: ${creds.host}`);
  } else {
    log(`no ${opts.to.toUpperCase()}_SUPABASE_* variables: dry run against an empty database`);
  }
  const plan = planPublish(built, snapshot);
  for (const e of plan.entries) {
    const detail = e.action === "changed" ? ` (${e.from} to ${e.semver})` : e.reason ? ` (${e.reason})` : "";
    log(`${e.action.padEnd(9)} ${e.code} ${e.title} ${e.semver}${detail}`);
  }
  const counts: Record<string, number> = {};
  for (const k of Object.keys(plan.seed) as (keyof Seed)[]) counts[k] = plan.seed[k].length;
  const tally = (a: PlanAction) => plan.entries.filter((e) => e.action === a).length;
  log(`versions: ${tally("new")} new, ${tally("changed")} changed, ${tally("unchanged")} unchanged, ${tally("held")} held`);

  if (dryRun) {
    log("dry run: nothing written");
    return { dryRun: true, applied: false, entries: plan.entries, counts, assumedEmpty };
  }

  // 5. Apply through the seed's own path: statuses are insert-only.
  const apply =
    opts.deps?.apply ??
    ((seed, c, l) => applySeed(seed, { url: c.url, serviceRoleKey: c.serviceRoleKey, log: (line) => l(`  ${line}`) }));
  await apply(plan.seed, creds!, log);
  log(`published to ${opts.to}`);
  return { dryRun: false, applied: true, entries: plan.entries, counts, assumedEmpty };
}
