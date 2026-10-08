import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CONFLICT_KEYS, INSERT_ONLY_COLUMNS, TABLE_ORDER, type Seed } from "./rows";

/**
 * Push the seed through supabase-js with the service role key. The key is
 * read from the environment and never logged; errors are reported by table
 * and batch only.
 */

export const BATCH_SIZE = 200;

export interface ApplyOptions {
  url?: string;
  serviceRoleKey?: string;
  batchSize?: number;
  log?: (line: string) => void;
}

export interface ApplyReport {
  table: string;
  rows: number;
  batches: number;
}

export function clientFromEnv(opts: ApplyOptions = {}): SupabaseClient {
  const url = opts.url ?? process.env.SUPABASE_URL;
  const key = opts.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

async function upsertTable(
  client: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  conflict: string[],
  batchSize: number,
): Promise<ApplyReport> {
  const batches = chunk(rows, batchSize);
  for (const [i, batch] of batches.entries()) {
    const { error } = await client.from(table).upsert(batch, { onConflict: conflict.join(","), ignoreDuplicates: false });
    if (error) {
      // error.message comes from PostgREST and carries no key material.
      throw new Error(`${table} batch ${i + 1}/${batches.length}: ${error.message}`);
    }
  }
  return { table, rows: rows.length, batches: batches.length };
}

/**
 * Split rows into ones to insert whole and ones that already exist, which lose
 * their insert-only columns so the upsert leaves those values alone.
 */
export function splitInsertOnly(
  rows: Record<string, unknown>[],
  existing: Set<string>,
  insertOnly: readonly string[],
  key = "id",
): { fresh: Record<string, unknown>[]; known: Record<string, unknown>[] } {
  const fresh: Record<string, unknown>[] = [];
  const known: Record<string, unknown>[] = [];
  for (const r of rows) {
    if (existing.has(String(r[key]))) {
      const copy = { ...r };
      for (const c of insertOnly) delete copy[c];
      known.push(copy);
    } else fresh.push(r);
  }
  return { fresh, known };
}

async function existingIds(client: SupabaseClient, table: string, ids: string[], batchSize: number): Promise<Set<string>> {
  const found = new Set<string>();
  for (const [i, batch] of chunk(ids, batchSize).entries()) {
    const { data, error } = await client.from(table).select("id").in("id", batch);
    if (error) throw new Error(`${table} lookup ${i + 1}: ${error.message}`);
    for (const row of (data ?? []) as { id: string }[]) found.add(row.id);
  }
  return found;
}

export async function applySeed(seed: Seed, opts: ApplyOptions = {}): Promise<ApplyReport[]> {
  const client = clientFromEnv(opts);
  const batchSize = opts.batchSize ?? BATCH_SIZE;
  const log = opts.log ?? (() => undefined);
  const reports: ApplyReport[] = [];

  for (const table of TABLE_ORDER) {
    let rows = seed[table] as unknown as Record<string, unknown>[];
    // First pass on workbooks leaves current_version_id null; the versions do
    // not exist yet. The pointer is set in a second pass below.
    if (table === "workbooks") rows = rows.map((r) => ({ ...r, current_version_id: null }));
    const insertOnly = INSERT_ONLY_COLUMNS[table] ?? [];
    let report: ApplyReport;
    if (insertOnly.length) {
      const existing = await existingIds(client, table, rows.map((r) => String(r.id)), batchSize);
      const { fresh, known } = splitInsertOnly(rows, existing, insertOnly);
      const a = await upsertTable(client, table, fresh, CONFLICT_KEYS[table], batchSize);
      const b = await upsertTable(client, table, known, CONFLICT_KEYS[table], batchSize);
      report = { table, rows: rows.length, batches: a.batches + b.batches };
    } else {
      report = await upsertTable(client, table, rows, CONFLICT_KEYS[table], batchSize);
    }
    reports.push(report);
    log(`${table}: ${report.rows} rows in ${report.batches} batch(es)`);
  }

  const pointed = seed.workbooks.filter((w) => w.current_version_id);
  if (pointed.length) {
    // Every pointed row exists after the first pass, so its insert-only columns are left alone.
    const { known } = splitInsertOnly(
      pointed as unknown as Record<string, unknown>[],
      new Set(pointed.map((w) => w.id)),
      INSERT_ONLY_COLUMNS.workbooks ?? [],
    );
    const report = await upsertTable(client, "workbooks", known, CONFLICT_KEYS.workbooks, batchSize);
    reports.push({ ...report, table: "workbooks.current_version_id" });
    log(`workbooks.current_version_id: ${report.rows} rows in ${report.batches} batch(es)`);
  }
  return reports;
}
