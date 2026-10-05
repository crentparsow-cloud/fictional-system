// AES-256-GCM sealing for reader answers. Shared by the answers and account functions.
const te = new TextEncoder(), td = new TextDecoder();
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
let keyPromise: Promise<CryptoKey> | null = null;
function key(): Promise<CryptoKey> {
  const secret = Deno.env.get("ANSWERS_KEY") ?? "";
  if (secret.length < 32) throw new Error("not_configured");
  keyPromise ??= crypto.subtle.digest("SHA-256", te.encode("workbooks-answers-v1:" + secret))
    .then((raw) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]));
  return keyPromise;
}
export async function unseal(sealed: string, owner: string): Promise<unknown> {
  const raw = unb64(sealed.slice(3));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12), additionalData: te.encode(owner) }, await key(), raw.slice(12));
  return JSON.parse(td.decode(pt));
}
