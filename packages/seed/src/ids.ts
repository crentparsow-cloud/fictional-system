import { createHash } from "node:crypto";

/**
 * Deterministic ids for seed rows.
 *
 * stableUuid follows the shape of RFC 4122 version 5: sha1 over a namespace
 * uuid's bytes plus the name, then the version and variant bits are set and
 * the first 16 bytes are formatted as a uuid. The same name always yields the
 * same id, so the seed can be re-applied and rows upsert in place.
 */

/** Namespace for every Akana seed id. Fixed; changing it changes every id. */
export const AKANA_SEED_NAMESPACE = "3c4f1d1a-9b2e-5a7c-8e6d-2f0b7a1c9d44";

function uuidBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error(`not a uuid: ${uuid}`);
  return Buffer.from(hex, "hex");
}

export function stableUuid(name: string, namespace = AKANA_SEED_NAMESPACE): string {
  const digest = createHash("sha1").update(uuidBytes(namespace)).update(name, "utf8").digest();
  const b = Buffer.from(digest.subarray(0, 16));
  b[6] = (b[6]! & 0x0f) | 0x50; // version 5
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = b.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Moved to @akana/schema so the app and the seed share one implementation.
export { canonicalJson, contentHash } from "@akana/schema";
