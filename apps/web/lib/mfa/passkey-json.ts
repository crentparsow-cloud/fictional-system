/**
 * Passkeys as a second factor (F-143), behind the mfa_passkey flag.
 *
 * Supabase Auth runs WebAuthn as an MFA factor (factor type "webauthn",
 * amr "mfa/webauthn"). The session cookie is HttpOnly, so the Supabase calls
 * run on the server and only the browser ceremony (navigator.credentials)
 * runs on the page. The two sides pass the options and the credential as
 * JSON, with binary fields in base64url, as WebAuthn Level 3 does. This file
 * is the conversion both ways, with no DOM or Node specifics.
 */

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function toBase64Url(input: ArrayBuffer | ArrayBufferView): string {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]!;
  }
  return out;
}

/** Decode base64url (padding and standard alphabet tolerated). Null when it is not base64. */
export function fromBase64Url(s: string): Uint8Array | null {
  const clean = s.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  if (!/^[A-Za-z0-9_-]*$/.test(clean) || clean.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]!);
    const b = B64.indexOf(clean[i + 1] ?? "A");
    const c = i + 2 < clean.length ? B64.indexOf(clean[i + 2]!) : 0;
    const d = i + 3 < clean.length ? B64.indexOf(clean[i + 3]!) : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (i + 2 < clean.length && o < out.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < clean.length && o < out.length) out[o++] = n & 255;
  }
  return out;
}

function isBinary(v: unknown): v is ArrayBuffer | ArrayBufferView {
  return v instanceof ArrayBuffer || ArrayBuffer.isView(v);
}

/** Turn every binary field into base64url, deeply. For the server, before options go to the page. */
export function binaryToJson(value: unknown): unknown {
  if (isBinary(value)) return toBase64Url(value);
  if (Array.isArray(value)) return value.map(binaryToJson);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = binaryToJson(v);
    }
    return out;
  }
  return value;
}

type Json = Record<string, unknown>;

function decodeField(s: unknown): Uint8Array | null {
  return typeof s === "string" ? fromBase64Url(s) : null;
}

function decodeDescriptors(list: unknown): Json[] | undefined {
  if (!Array.isArray(list)) return undefined;
  const out: Json[] = [];
  for (const d of list) {
    if (!d || typeof d !== "object") continue;
    const id = decodeField((d as Json).id);
    if (id) out.push({ ...(d as Json), id, type: "public-key" });
  }
  return out;
}

/** Options for navigator.credentials.create, from the JSON the server sent. Null when malformed. */
export function creationOptionsFromJson(json: unknown): Json | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Json;
  const challenge = decodeField(o.challenge);
  const user = o.user as Json | undefined;
  const userId = decodeField(user?.id);
  if (!challenge || !user || !userId) return null;
  const out: Json = { ...o, challenge, user: { ...user, id: userId } };
  const exclude = decodeDescriptors(o.excludeCredentials);
  if (exclude) out.excludeCredentials = exclude;
  return out;
}

/** Options for navigator.credentials.get, from the JSON the server sent. Null when malformed. */
export function requestOptionsFromJson(json: unknown): Json | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Json;
  const challenge = decodeField(o.challenge);
  if (!challenge) return null;
  const out: Json = { ...o, challenge };
  const allow = decodeDescriptors(o.allowCredentials);
  if (allow) out.allowCredentials = allow;
  return out;
}

/** The longest credential JSON the server accepts. Real ones are a few kilobytes. */
export const CREDENTIAL_JSON_MAX = 64 * 1024;

export type CredentialKind = "create" | "request";

/**
 * Check the credential JSON a page posts back before it goes to Supabase,
 * which verifies the signature itself. Shape only: id, type and the
 * response fields WebAuthn requires for this kind of ceremony.
 */
export function parseCredentialJson(raw: unknown, kind: CredentialKind): Json | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > CREDENTIAL_JSON_MAX) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const c = v as Json;
  if (c.type !== "public-key" || typeof c.id !== "string" || !fromBase64Url(c.id)) return null;
  const r = c.response as Json | undefined;
  if (!r || typeof r !== "object" || typeof r.clientDataJSON !== "string") return null;
  if (kind === "create" && typeof r.attestationObject !== "string") return null;
  if (kind === "request" && (typeof r.authenticatorData !== "string" || typeof r.signature !== "string")) return null;
  return c;
}

/** The JSON form of a credential from the browser, using toJSON where the browser has it. */
export function credentialToJson(cred: unknown): Json | null {
  if (!cred || typeof cred !== "object") return null;
  const c = cred as { toJSON?: () => unknown; id?: unknown; type?: unknown; response?: Record<string, unknown>; authenticatorAttachment?: unknown; getClientExtensionResults?: () => unknown };
  if (typeof c.toJSON === "function") {
    const j = c.toJSON();
    return j && typeof j === "object" ? (j as Json) : null;
  }
  if (typeof c.id !== "string" || !c.response) return null;
  const response: Json = {};
  for (const k of ["clientDataJSON", "attestationObject", "authenticatorData", "signature", "userHandle"]) {
    const v = c.response[k];
    if (isBinary(v)) response[k] = toBase64Url(v);
  }
  return {
    id: c.id,
    rawId: c.id,
    type: "public-key",
    response,
    clientExtensionResults: typeof c.getClientExtensionResults === "function" ? c.getClientExtensionResults() : {},
    authenticatorAttachment: typeof c.authenticatorAttachment === "string" ? c.authenticatorAttachment : undefined,
  };
}

/** The relying party for this request: the bare host name, and the origin. */
export function relyingParty(origin: string): { rpId: string; rpOrigins: string[] } | null {
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:" && u.hostname !== "localhost") return null;
    return { rpId: u.hostname, rpOrigins: [u.origin] };
  } catch {
    return null;
  }
}
