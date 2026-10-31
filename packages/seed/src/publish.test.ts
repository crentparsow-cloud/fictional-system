import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSeed, classicFiles, demoFiles, repoRoot } from "./build";
import {
  EMPTY_SNAPSHOT,
  PublishRefused,
  bumpPatch,
  gateClassics,
  planPublish,
  runPublish,
  targetCredentials,
  type DbSnapshot,
} from "./publish";
import type { Seed } from "./rows";

const root = repoRoot();
const seed = buildSeed();
const classicCode = (JSON.parse(readFileSync(classicFiles(root)[0]!, "utf8")) as { code: string }).code;
const classicRow = () => seed.workbooks.find((w) => w.code === classicCode)!;
const classicVersion = () => seed.workbook_versions.find((v) => v.workbook_id === classicRow().id)!;

/** A snapshot that already holds every version in the seed, with the given status for every workbook. */
function snapshotOf(s: Seed, status: string): DbSnapshot {
  return {
    workbooks: new Map(s.workbooks.map((w) => [w.id, { status, current_version_id: w.current_version_id }])),
    versions: s.workbook_versions.map((v) => ({ id: v.id, workbook_id: v.workbook_id, semver: v.semver, content_hash: v.content_hash })),
  };
}

describe("planPublish: versions by content hash", () => {
  it("reports every written workbook as new against an empty database", () => {
    const { entries, seed: out } = planPublish(seed, EMPTY_SNAPSHOT);
    expect(entries).toHaveLength(20 + classicFiles(root).length + demoFiles(root).length);
    expect(entries.every((e) => e.action === "new")).toBe(true);
    expect(out.workbook_versions).toHaveLength(entries.length);
  });

  it("reports identical content as unchanged and keeps the pointer", () => {
    const { entries } = planPublish(seed, snapshotOf(seed, "in_review"));
    expect(entries.every((e) => e.action === "unchanged")).toBe(true);
  });

  it("gives changed content for an unreleased title the next patch version beside the old one", () => {
    const db = snapshotOf(seed, "in_review");
    const old = db.versions.find((v) => v.id === classicVersion().id)!;
    old.content_hash = "0".repeat(64);
    const { entries, seed: out } = planPublish(seed, db);
    const e = entries.find((x) => x.code === classicCode)!;
    expect(e).toMatchObject({ action: "changed", from: "1.0.0", semver: "1.0.1" });
    const row = out.workbooks.find((w) => w.code === classicCode)!;
    const v = out.workbook_versions.find((x) => x.workbook_id === row.id)!;
    expect(v.semver).toBe("1.0.1");
    expect(v.id).not.toBe(old.id);
    expect(row.current_version_id).toBe(v.id);
  });

  it("holds changed content for a released title and keeps its database pointer", () => {
    const db = snapshotOf(seed, "live");
    const old = db.versions.find((v) => v.id === classicVersion().id)!;
    old.content_hash = "0".repeat(64);
    const { entries, seed: out } = planPublish(seed, db);
    expect(entries.find((x) => x.code === classicCode)).toMatchObject({ action: "held" });
    expect(out.workbook_versions.some((v) => v.workbook_id === classicRow().id)).toBe(false);
    expect(out.workbooks.find((w) => w.code === classicCode)!.current_version_id).toBe(old.id);
  });

  it("does not null a pointer the database holds for a title with no content in this build (any badge)", () => {
    const bare = seed.workbooks.find((w) => !w.current_version_id)!;
    const db: DbSnapshot = { workbooks: new Map([[bare.id, { status: "draft", current_version_id: "11111111-1111-5111-8111-111111111111" }]]), versions: [] };
    const out = planPublish(seed, db).seed.workbooks.find((w) => w.id === bare.id)!;
    expect(out.current_version_id).toBe("11111111-1111-5111-8111-111111111111");
  });

  it("bumps patch numbers and rejects odd semvers", () => {
    expect(bumpPatch("1.0.9")).toBe("1.0.10");
    expect(() => bumpPatch("1.0")).toThrow();
  });
});

describe("gateClassics", () => {
  it("passes the real classics", () => {
    expect(gateClassics(root, classicFiles(root))).toEqual([]);
  });

  it("fails a classic with no house record, a live status or a missing licence reference", () => {
    const tmp = mkdtempSync(join(tmpdir(), "akana-gate-"));
    mkdirSync(join(tmp, "content", "public-domain"), { recursive: true });
    const file = join(tmp, "classic.json");
    writeFileSync(file, JSON.stringify({ code: "AK-FN9KB", status: "live" }));
    expect(gateClassics(tmp, [file]).map((p) => p.message).join("\n")).toMatch(/not allowed for a classic[\s\S]*no house record/);

    cpSync(join(root, "content", "public-domain", "AK-FN9KB.json"), join(tmp, "content", "public-domain", "AK-FN9KB.json"));
    writeFileSync(file, JSON.stringify({ code: "AK-FN9KB", status: "in_review" }));
    expect(gateClassics(tmp, [file]).map((p) => p.message)).toEqual(["licence_ref should be public-domain:/public-domain/AK-FN9KB"]);
  });

  it("fails when a contributor's UK term has not run out", () => {
    const tmp = mkdtempSync(join(tmpdir(), "akana-gate-"));
    mkdirSync(join(tmp, "content", "public-domain"), { recursive: true });
    writeFileSync(
      join(tmp, "content", "public-domain", "AK-AAAAA.json"),
      JSON.stringify({ firstPublished: "1950", people: [{ name: "A", role: "author", died: 1990 }] }),
    );
    const file = join(tmp, "c.json");
    writeFileSync(file, JSON.stringify({ code: "AK-AAAAA", status: "in_review", licence_ref: "public-domain:/public-domain/AK-AAAAA" }));
    expect(gateClassics(tmp, [file], 2026).map((p) => p.message)).toEqual(["copyright check is not clear in the house record"]);
  });
});

describe("runPublish", () => {
  const lines: string[] = [];
  const base = { root, log: (l: string) => lines.push(l), env: {} as NodeJS.ProcessEnv };

  it("dry run validates, plans and writes nothing, with no database variables set", async () => {
    let applied = false;
    const r = await runPublish({ ...base, to: "staging", dryRun: true, deps: { apply: async () => { applied = true; return []; } } });
    expect(applied).toBe(false);
    expect(r).toMatchObject({ dryRun: true, applied: false, assumedEmpty: true });
    expect(r.entries).toHaveLength(20 + classicFiles(root).length + demoFiles(root).length);
    expect(r.counts.workbooks).toBe(190);
    expect(lines.join("\n")).toMatch(/dry run: nothing written/);
    expect(lines.join("\n")).toMatch(new RegExp(`validated ${20 + classicFiles(root).length + demoFiles(root).length} file\\(s\\)`));
    expect(lines.join("\n")).toMatch(/never set live/);
  });

  it("refuses production without --yes, but allows a production dry run", async () => {
    await expect(runPublish({ ...base, to: "production" })).rejects.toThrow(/explicit --yes/);
    await expect(runPublish({ ...base, to: "production", dryRun: true })).resolves.toMatchObject({ applied: false });
  });

  it("refuses to apply without the target's own variables", async () => {
    await expect(runPublish({ ...base, to: "staging" })).rejects.toThrow(/STAGING_SUPABASE_URL/);
    // A key for the other target is not enough.
    const env = { PRODUCTION_SUPABASE_URL: "https://p.example.co", PRODUCTION_SUPABASE_SERVICE_ROLE_KEY: "k" };
    await expect(runPublish({ ...base, env, to: "staging" })).rejects.toThrow(/STAGING_SUPABASE_URL/);
  });

  it("refuses when staging and production are the same database", async () => {
    const env = {
      STAGING_SUPABASE_URL: "https://same.example.co",
      STAGING_SUPABASE_SERVICE_ROLE_KEY: "a",
      PRODUCTION_SUPABASE_URL: "https://same.example.co",
      PRODUCTION_SUPABASE_SERVICE_ROLE_KEY: "b",
    };
    await expect(runPublish({ ...base, env, to: "staging" })).rejects.toBeInstanceOf(PublishRefused);
  });

  it("applies the planned seed once, never logs the key, and keeps classics out of live", async () => {
    const env = { STAGING_SUPABASE_URL: "https://stg.example.co", STAGING_SUPABASE_SERVICE_ROLE_KEY: "secret-key-value" };
    const out: string[] = [];
    let sent: Seed | undefined;
    const r = await runPublish({
      root,
      env,
      to: "staging",
      log: (l) => out.push(l),
      deps: {
        snapshot: async () => EMPTY_SNAPSHOT,
        apply: async (s) => {
          sent = s;
          return [];
        },
      },
    });
    expect(r.applied).toBe(true);
    expect(out.join("\n")).not.toContain("secret-key-value");
    expect(out.join("\n")).toContain("stg.example.co");
    const classics = sent!.workbooks.filter((w) => w.badge === "public_domain");
    expect(classics.every((w) => w.status === "draft" || w.status === "in_review")).toBe(true);
    expect(sent!.workbooks.every((w) => w.status !== "live")).toBe(true);
  });

  it("stops before any write when a file fails validation", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "akana-pub-"));
    mkdirSync(join(tmp, "content", "workbooks", "classics"), { recursive: true });
    writeFileSync(join(tmp, "content", "workbooks", "classics", "bad.json"), "{}");
    let applied = false;
    await expect(
      runPublish({ root: tmp, to: "staging", dryRun: true, env: {}, deps: { apply: async () => { applied = true; return []; } } }),
    ).rejects.toThrow(/Validation failed/);
    expect(applied).toBe(false);
  });
});

describe("targetCredentials", () => {
  it("reads the prefixed pair only", () => {
    expect(targetCredentials("staging", { SUPABASE_URL: "https://x.co", SUPABASE_SERVICE_ROLE_KEY: "k" })).toBeNull();
    expect(targetCredentials("production", { PRODUCTION_SUPABASE_URL: "https://x.co", PRODUCTION_SUPABASE_SERVICE_ROLE_KEY: "k" })?.host).toBe("x.co");
  });
});
