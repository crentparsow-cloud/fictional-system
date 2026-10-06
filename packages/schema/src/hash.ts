import { createHash } from "node:crypto";

/**
 * Content hashing for workbook versions (F-110).
 *
 * One implementation, shared by the app and the seed. The output must stay
 * byte-for-byte stable: every stored content_hash depends on it. Do not change
 * key order, whitespace or the treatment of undefined.
 */

/** JSON with keys sorted at every level and no whitespace. Undefined values are dropped. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = sortKeys(v);
    }
    return out;
  }
  return value;
}

/** sha256 hex of the canonical JSON of a document. */
export function contentHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}
