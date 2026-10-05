import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CONFLICT_KEYS, TABLE_ORDER, type Seed } from "./rows";

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
    const report = await upsertTable(client, table, rows, CONFLICT_KEYS[table], batchSize);
    reports.push(report);
    log(`${table}: ${report.rows} rows in ${report.batches} batch(es)`);
  }

  const pointed = seed.workbooks.filter((w) => w.current_version_id);
  if (pointed.length) {
    const report = await upsertTable(client, "workbooks", pointed as unknown as Record<string, unknown>[], CONFLICT_KEYS.workbooks, batchSize);
    reports.push({ ...report, table: "workbooks.current_version_id" });
    log(`workbooks.current_version_id: ${report.rows} rows in ${report.batches} batch(es)`);
  }
  return reports;
}
