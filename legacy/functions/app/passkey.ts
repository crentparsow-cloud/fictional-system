// passkey: device-verified history download.
// A passkey assertion with user verification proves the person holding the phone unlocked it
// (Face ID, fingerprint, PIN or pattern). A verified assertion, or a correct emailed 6-digit code,
// gives a single-use export token that lasts 5 minutes. The export op in account.ts requires it.
// rpID and the expected origin come from app_config.app_url, so they follow a domain change.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
} from "npm:@simplewebauthn/server@13";
import { config, deviceWords, json, longDateTime, randomToken, send, serverSecret, sha256, userEmail } from "./_shared/mailer.ts";

const MIN = 60000;
const CHALLENGE_TTL = 5 * MIN, EXPORT_TOKEN_TTL = 5 * MIN, CODE_TTL = 10 * MIN;
const MAX_PASSKEYS = 10, MAX_CODE_ATTEMPTS = 5, MAX_CODES_PER_HOUR = 3;

const b64urlEncode = (u: Uint8Array) => { let s = ""; for (const b of u) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const b64urlDecode = (s: string) => { const p = s.replace(/-/g, "+").replace(/_/g, "/"); return Uint8Array.from(atob(p + "=".repeat((4 - p.length % 4) % 4)), (c) => c.charCodeAt(0)); };

async function rp(db: SupabaseClient) {
  const cfg = await config(db);
  const url = new URL(cfg.app_url);
  const extra = String(cfg.webauthn_extra_origins ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return { rpID: url.hostname, rpName: cfg.app_name || "Akana", origins: [url.origin, ...extra] };
}

function challengeOf(response: any): string | null {
  try { return JSON.parse(new TextDecoder().decode(b64urlDecode(String(response?.response?.clientDataJSON ?? "")))).challenge ?? null; }
  catch { return null; }
}
/** Single use: marks the challenge used and returns it, or null if it is unknown, used or expired. */
async function claimChallenge(db: SupabaseClient, userId: string, purpose: string, challenge: string | null) {
  if (!challenge) return null;
  const { data } = await db.from("webauthn_challenges").update({ used_at: new Date().toISOString() })
    .eq("user_id", userId).eq("purpose", purpose).eq("challenge", challenge).is("used_at", null).gt("expires_at", new Date().toISOString())
    .select("challenge").maybeSingle();
  return data?.challenge ?? null;
}
async function saveChallenge(db: SupabaseClient, userId: string, purpose: string, challenge: string) {
  await db.from("webauthn_challenges").delete().eq("user_id", userId).lt("expires_at", new Date(Date.now() - 60 * MIN).toISOString());
  const { error } = await db.from("webauthn_challenges").insert({ user_id: userId, purpose, challenge, expires_at: new Date(Date.now() + CHALLENGE_TTL).toISOString() });
  if (error) throw error;
}

async function issueExportToken(db: SupabaseClient, userId: string, method: "passkey" | "email_code") {
  const token = randomToken();
  const expires = new Date(Date.now() + EXPORT_TOKEN_TTL).toISOString();
  const { error } = await db.from("export_tokens").insert({ token_hash: await sha256(token), user_id: userId, method, expires_at: expires });
  if (error) throw error;
  return { export_token: token, expires_at: expires, method };
}
/** Used by the export op. True once only, within 5 minutes, for the same reader. */
export async function consumeExportToken(db: SupabaseClient, userId: string, token: unknown): Promise<boolean> {
  if (typeof token !== "string" || !/^[0-9a-f]{48}$/.test(token)) return false;
  const { data } = await db.from("export_tokens").update({ used_at: new Date().toISOString() })
    .eq("token_hash", await sha256(token)).eq("user_id", userId).is("used_at", null).gt("expires_at", new Date().toISOString())
    .select("token_hash").maybeSingle();
  return !!data;
}

// ---------- passkeys ----------
async function registrationOptions(db: SupabaseClient, user: { id: string; email?: string }) {
  const { data: creds } = await db.from("passkeys").select("credential_id,transports").eq("user_id", user.id);
  if ((creds?.length ?? 0) >= MAX_PASSKEYS) return json({ error: "too_many_passkeys", message: "You have the most passkeys allowed. Remove one first." }, 409);
  const { rpID, rpName } = await rp(db);
  const options = await generateRegistrationOptions({
    rpName, rpID, userName: user.email || "Akana reader", userID: new TextEncoder().encode(user.id), attestationType: "none",
    excludeCredentials: (creds ?? []).map((c: any) => ({ id: c.credential_id, transports: c.transports ?? [] })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });
  await saveChallenge(db, user.id, "register", options.challenge);
  return json({ options });
}

async function registrationVerify(db: SupabaseClient, userId: string, b: any, ua?: string | null) {
  const challenge = await claimChallenge(db, userId, "register", challengeOf(b.response));
  if (!challenge) return json({ error: "challenge_expired", message: "That took too long. Please try again." }, 400);
  const { rpID, origins } = await rp(db);
  let v;
  try {
    v = await verifyRegistrationResponse({ response: b.response, expectedChallenge: challenge, expectedOrigin: origins, expectedRPID: rpID, requireUserVerification: true });
  } catch (e) { console.error("passkey_register_failed", (e as Error).message); return json({ error: "not_verified", message: "That passkey could not be checked." }, 400); }
  if (!v.verified || !v.registrationInfo) return json({ error: "not_verified", message: "That passkey could not be checked." }, 400);
  const { credential, credentialDeviceType, credentialBackedUp } = v.registrationInfo;
  const nickname = typeof b.nickname === "string" ? b.nickname.trim().slice(0, 40) || null : null;
  const { data, error } = await db.from("passkeys").insert({
    user_id: userId, credential_id: credential.id, public_key: b64urlEncode(credential.publicKey), counter: credential.counter,
    transports: credential.transports ?? [], device_type: credentialDeviceType, backed_up: credentialBackedUp, nickname,
  }).select("id,nickname,created_at,device_type,backed_up").single();
  if (error) {
    if ((error as any).code === "23505") return json({ error: "already_registered", message: "This passkey is already set up." }, 409);
    throw error;
  }
  // A security note to the reader. A failed email never fails the registration.
  const me = await userEmail(db, userId);
  if (me.email) {
    await send(db, { to: me.email, userId, template: "passkey_added", dedupe: `passkey_added:${data.id}`,
      vars: { name: me.name, when: longDateTime(data.created_at ?? new Date(), me.tz), device: deviceWords(ua) } })
      .catch((e) => console.error("passkey_mail_failed", (e as Error).message));
  }
  return json({ ok: true, passkey: data });
}

async function authenticationOptions(db: SupabaseClient, userId: string) {
  const { data: creds } = await db.from("passkeys").select("credential_id,transports").eq("user_id", userId);
  if (!creds?.length) return json({ error: "no_passkey", message: "Set up a passkey first, or use an emailed code." }, 404);
  const { rpID } = await rp(db);
  const options = await generateAuthenticationOptions({
    rpID, userVerification: "required", allowCredentials: creds.map((c: any) => ({ id: c.credential_id, transports: c.transports ?? [] })),
  });
  await saveChallenge(db, userId, "authenticate", options.challenge);
  return json({ options });
}

async function authenticationVerify(db: SupabaseClient, userId: string, b: any) {
  const challenge = await claimChallenge(db, userId, "authenticate", challengeOf(b.response));
  if (!challenge) return json({ error: "challenge_expired", message: "That took too long. Please try again." }, 400);
  const { data: pk } = await db.from("passkeys").select("*").eq("user_id", userId).eq("credential_id", String(b.response?.id ?? "")).maybeSingle();
  if (!pk) return json({ error: "unknown_passkey", message: "That passkey is not set up on this account." }, 400);
  const { rpID, origins } = await rp(db);
  let v;
  try {
    v = await verifyAuthenticationResponse({
      response: b.response, expectedChallenge: challenge, expectedOrigin: origins, expectedRPID: rpID, requireUserVerification: true,
      credential: { id: pk.credential_id, publicKey: b64urlDecode(pk.public_key), counter: Number(pk.counter), transports: pk.transports ?? [] },
    });
  } catch (e) { console.error("passkey_auth_failed", (e as Error).message); return json({ error: "not_verified", message: "Your phone could not confirm it was you." }, 403); }
  if (!v.verified || !v.authenticationInfo.userVerified) return json({ error: "not_verified", message: "Your phone could not confirm it was you." }, 403);
  await db.from("passkeys").update({ counter: v.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq("id", pk.id);
  return json({ ok: true, ...(await issueExportToken(db, userId, "passkey")) });
}

// ---------- emailed 6-digit code (fallback) ----------
async function codeHash(db: SupabaseClient, userId: string, code: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(await serverSecret(db)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`export_code:${userId}:${code}`)));
  return Array.from(sig, (x) => x.toString(16).padStart(2, "0")).join("");
}
function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function codeRequest(db: SupabaseClient, userId: string) {
  const { count } = await db.from("export_codes").select("id", { count: "exact", head: true }).eq("user_id", userId).gt("created_at", new Date(Date.now() - 60 * MIN).toISOString());
  if ((count ?? 0) >= MAX_CODES_PER_HOUR) return json({ error: "too_many_codes", message: "Please wait a little before asking for another code." }, 429);
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  const code = String(n).padStart(6, "0");
  const expires = new Date(Date.now() + CODE_TTL).toISOString();
  // Only the newest code works.
  await db.from("export_codes").update({ used_at: new Date().toISOString() }).eq("user_id", userId).is("used_at", null);
  const { data, error } = await db.from("export_codes").insert({ user_id: userId, code_hash: await codeHash(db, userId, code), expires_at: expires }).select("id").single();
  if (error) throw error;
  // The code goes by email only. It is never returned to the browser or logged.
  const me = await userEmail(db, userId);
  if (!me.email) return json({ error: "no_email", message: "There is no email address on this account." }, 409);
  const sent = await send(db, { to: me.email, userId, template: "export_code", dedupe: `export_code:${data.id}`,
    vars: { name: me.name, code, expires_minutes: CODE_TTL / MIN } }).catch((e) => { console.error("export_code_mail_failed", (e as Error).message); return "failed" as const; });
  if (sent !== "sent") return json({ error: "email_failed", message: "The code could not be sent just now. Please try again." }, 502);
  return json({ ok: true, expires_at: expires, delivery: "email" });
}

async function codeVerify(db: SupabaseClient, userId: string, b: any) {
  const code = String(b.code ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return json({ error: "invalid_code", message: "Please enter the 6-digit code." }, 400);
  const { data: row } = await db.from("export_codes").select("id,code_hash,expires_at,attempts").eq("user_id", userId).is("used_at", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!row || Date.parse(row.expires_at) < Date.now()) return json({ error: "code_expired", message: "That code has expired. Ask for a new one." }, 400);
  if (row.attempts >= MAX_CODE_ATTEMPTS) return json({ error: "too_many_attempts", message: "Too many tries. Ask for a new code." }, 429);
  await db.from("export_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
  if (!sameText(row.code_hash, await codeHash(db, userId, code))) {
    return json({ error: "wrong_code", message: "That code is not right.", attempts_left: MAX_CODE_ATTEMPTS - row.attempts - 1 }, 400);
  }
  const { data: claimed } = await db.from("export_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id).is("used_at", null).select("id").maybeSingle();
  if (!claimed) return json({ error: "code_expired", message: "That code has expired. Ask for a new one." }, 400);
  return json({ ok: true, ...(await issueExportToken(db, userId, "email_code")) });
}

// ---------- list and remove ----------
async function list(db: SupabaseClient, userId: string) {
  const { data } = await db.from("passkeys").select("id,nickname,created_at,last_used_at,device_type,backed_up").eq("user_id", userId).order("created_at");
  return json({ passkeys: data ?? [] });
}
async function remove(db: SupabaseClient, userId: string, b: any) {
  const id = Number(b.id);
  if (!Number.isInteger(id)) return json({ error: "Invalid request" }, 400);
  const { data } = await db.from("passkeys").delete().eq("id", id).eq("user_id", userId).select("id").maybeSingle();
  return data ? json({ ok: true }) : json({ error: "not_found" }, 404);
}

/** Returns a response for a passkey or export-code op, or null if the op is not one of these. */
export async function passkeyOp(db: SupabaseClient, user: { id: string; email?: string }, b: any, ua?: string | null): Promise<Response | null> {
  switch (b.op) {
    case "passkey_register_options": return await registrationOptions(db, user);
    case "passkey_register_verify": return await registrationVerify(db, user.id, b, ua);
    case "passkey_auth_options": return await authenticationOptions(db, user.id);
    case "passkey_auth_verify": return await authenticationVerify(db, user.id, b);
    case "passkey_list": return await list(db, user.id);
    case "passkey_remove": return await remove(db, user.id, b);
    case "export_code_request": return await codeRequest(db, user.id);
    case "export_code_verify": return await codeVerify(db, user.id, b);
  }
  return null;
}
