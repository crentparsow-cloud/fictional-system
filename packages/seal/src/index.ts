/**
 * Sealed answer storage (F-134). AES-256-GCM, 12-byte random IV, as in the
 * legacy seal.ts, with two changes from the architecture note (7.3):
 *
 *  1. A key ring replaces the single ANSWERS_KEY. Format of each key:
 *     v2.<key_id>.<base64 of 32 random bytes>. Several keys are separated by
 *     commas in ANSWERS_KEYS. The first key is active for new writes. Older
 *     keys stay for reading. Rotation re-seals in a background job.
 *  2. Additional authenticated data binds the ciphertext to
 *     user_id | tenant_id | field path, so a sealed value cannot be moved to
 *     another account, tenant or field.
 *
 * Legacy "v1." values (SHA-256 of "workbooks-answers-v1:" + secret, AAD = owner)
 * stay readable when ANSWERS_KEY_V1 is set, for any test data ever imported.
 *
 * Keys live in Vercel environment variables marked sensitive. Nothing here
 * logs plaintext or key material. Decryption runs only in server code acting
 * for the signed-in owner; there is no admin route that unseals.
 */

const te = new TextEncoder();
const td = new TextDecoder();

export interface SealScope {
  userId: string;
  tenantId: string;
  /** e.g. "exercise:plan_first_step.what" or "checkin:3" */
  field: string;
}

export interface SealedValue {
  /** "v2.<key_id>.<base64 iv+ciphertext>" */
  value: string;
  keyId: string;
}

interface RingEntry {
  id: string;
  key: Promise<CryptoKey>;
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const buf = Buffer.from(s, "base64");
  const out = new Uint8Array(new ArrayBuffer(buf.length));
  out.set(buf);
  return out;
}
function toB64(b: Uint8Array): string {
  return Buffer.from(b).toString("base64");
}

export function aad(scope: SealScope): Uint8Array<ArrayBuffer> {
  return te.encode(`${scope.userId}|${scope.tenantId}|${scope.field}`) as Uint8Array<ArrayBuffer>;
}

export class KeyRing {
  private readonly entries: RingEntry[];
  private readonly v1: Promise<CryptoKey> | null;

  private constructor(entries: RingEntry[], v1: Promise<CryptoKey> | null) {
    this.entries = entries;
    this.v1 = v1;
  }

  /** Build from the ANSWERS_KEYS env value (and optional legacy ANSWERS_KEY_V1). */
  static fromEnv(env: Record<string, string | undefined> = process.env): KeyRing {
    const raw = (env.ANSWERS_KEYS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (raw.length === 0) throw new Error("seal_not_configured");
    const entries = raw.map((spec) => {
      const m = /^v2\.([a-z0-9]{2,16})\.([A-Za-z0-9+/=]+)$/.exec(spec);
      if (!m) throw new Error("seal_bad_key_format");
      const bytes = fromB64(m[2]!);
      if (bytes.length !== 32) throw new Error("seal_bad_key_length");
      return { id: m[1]!, key: crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]) };
    });
    const ids = new Set(entries.map((e) => e.id));
    if (ids.size !== entries.length) throw new Error("seal_duplicate_key_id");

    let v1: Promise<CryptoKey> | null = null;
    const legacy = env.ANSWERS_KEY_V1 ?? "";
    if (legacy.length >= 32) {
      v1 = crypto.subtle
        .digest("SHA-256", te.encode("workbooks-answers-v1:" + legacy))
        .then((d) => crypto.subtle.importKey("raw", d, "AES-GCM", false, ["decrypt"]));
    }
    return new KeyRing(entries, v1);
  }

  get activeKeyId(): string {
    return this.entries[0]!.id;
  }

  async seal(value: unknown, scope: SealScope): Promise<SealedValue> {
    const active = this.entries[0]!;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const pt = te.encode(JSON.stringify(value)) as Uint8Array<ArrayBuffer>;
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(scope) }, await active.key, pt));
    const out = new Uint8Array(iv.length + ct.length);
    out.set(iv, 0);
    out.set(ct, iv.length);
    return { value: `v2.${active.id}.${toB64(out)}`, keyId: active.id };
  }

  /**
   * Unseal. For v2 values the scope must match exactly. For legacy v1 values
   * `legacyOwner` is the owner string the old code used as AAD.
   */
  async unseal(sealed: string, scope: SealScope, legacyOwner?: string): Promise<unknown> {
    if (sealed.startsWith("v2.")) {
      const [, keyId, b64] = sealed.split(".");
      const entry = this.entries.find((e) => e.id === keyId);
      if (!entry || !b64) throw new Error("seal_unknown_key");
      const raw = fromB64(b64);
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12), additionalData: aad(scope) }, await entry.key, raw.slice(12));
      return JSON.parse(td.decode(pt));
    }
    if (sealed.startsWith("v1.")) {
      if (!this.v1) throw new Error("seal_v1_not_configured");
      const raw = fromB64(sealed.slice(3));
      const pt = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: raw.slice(0, 12), additionalData: te.encode(legacyOwner ?? scope.userId) as Uint8Array<ArrayBuffer> },
        await this.v1,
        raw.slice(12),
      );
      return JSON.parse(td.decode(pt));
    }
    throw new Error("seal_unknown_format");
  }

  /** True when a value was sealed with a key other than the active one and should be re-sealed. */
  needsRotation(sealed: string): boolean {
    if (sealed.startsWith("v1.")) return true;
    const keyId = sealed.split(".")[1];
    return keyId !== this.activeKeyId;
  }
}

/** Generate a fresh key spec for ANSWERS_KEYS. Printed once by scripts/new-seal-key.ts, never logged elsewhere. */
export function newKeySpec(keyId = randomKeyId()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `v2.${keyId}.${toB64(bytes)}`;
}

function randomKeyId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
