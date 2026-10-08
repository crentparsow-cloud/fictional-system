"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth";
import { binaryToJson, parseCredentialJson, relyingParty, type CredentialKind } from "@/lib/mfa/passkey-json";
import { getRoleMfaSession, passkeyEnabled } from "@/lib/mfa/role-mfa-server";
import { originFrom } from "@/lib/partner";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Passkeys as a second factor (F-143), behind the mfa_passkey flag (off).
 * Supabase Auth MFA with factor type "webauthn". The Supabase calls run here
 * with the user client because the session cookie is HttpOnly; the page runs
 * only the browser ceremony and posts the credential back as JSON. Supabase
 * checks the signature, the challenge and the origin.
 *
 * Adding a passkey needs a session that already passed a second factor
 * (Supabase asks for aal2 to add a factor once one exists), so a passkey is
 * always a second way in, next to the authenticator app, never the only one.
 */

export type CeremonyState =
  | { status: "idle" }
  | { status: "ready"; kind: CredentialKind; factorId: string; challengeId: string; options: unknown }
  | { status: "error"; message: string };

export type FinishState = { error: string | null };

const OFF = "Passkeys are not switched on yet. Use your authenticator app.";

async function setup() {
  if (!(await passkeyEnabled())) return null;
  const rp = relyingParty(originFrom(await headers()));
  if (!rp) return null;
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/sign-in?next=/verify");
  return { supabase, rp };
}

/** Use a passkey already added, to reach aal2 on this session. */
export async function startPasskeyCheck(): Promise<CeremonyState> {
  const s = await setup();
  if (!s) return { status: "error", message: OFF };
  const { data: factors, error } = await s.supabase.auth.mfa.listFactors();
  const factor = error ? undefined : factors.webauthn[0];
  if (!factor) return { status: "error", message: "No passkey found on your account. Use your authenticator app." };
  const { data, error: chErr } = await s.supabase.auth.mfa.challenge({ factorId: factor.id, webauthn: s.rp });
  if (chErr || !data || data.webauthn.type !== "request") {
    console.error("passkey_challenge_failed", chErr?.code ?? "");
    return { status: "error", message: "Could not start the passkey check. Try again, or use your authenticator app." };
  }
  return { status: "ready", kind: "request", factorId: factor.id, challengeId: data.id, options: binaryToJson(data.webauthn.credential_options.publicKey) };
}

/** Add a passkey. Only from a session that already passed a second factor. */
export async function startPasskeyAdd(): Promise<CeremonyState> {
  const s = await setup();
  if (!s) return { status: "error", message: OFF };
  if (!(await getRoleMfaSession()).verified) return { status: "error", message: "Enter a code from your authenticator app first, then add a passkey." };
  const { data: factors, error: listErr } = await s.supabase.auth.mfa.listFactors();
  if (listErr) return { status: "error", message: "Could not read your sign-in settings. Try again." };
  if (factors.webauthn.length >= 5) return { status: "error", message: "You already have five passkeys. Ask support to remove one first." };
  for (const f of factors.all) {
    if (f.factor_type === "webauthn" && f.status === "unverified") await s.supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data: enrolled, error: enErr } = await s.supabase.auth.mfa.enroll({ factorType: "webauthn", friendlyName: `Akana passkey ${factors.webauthn.length + 1}` });
  if (enErr || !enrolled) {
    console.error("passkey_enrol_failed", enErr?.code ?? "");
    return { status: "error", message: "Could not start adding a passkey. Try again in a moment." };
  }
  const { data, error: chErr } = await s.supabase.auth.mfa.challenge({ factorId: enrolled.id, webauthn: s.rp });
  if (chErr || !data || data.webauthn.type !== "create") {
    console.error("passkey_challenge_failed", chErr?.code ?? "");
    await s.supabase.auth.mfa.unenroll({ factorId: enrolled.id });
    return { status: "error", message: "Could not start adding a passkey. Try again in a moment." };
  }
  return { status: "ready", kind: "create", factorId: enrolled.id, challengeId: data.id, options: binaryToJson(data.webauthn.credential_options.publicKey) };
}

/** Send the browser's answer to Supabase. On success the session is aal2 and the person goes on to `next`. */
export async function finishPasskey(_prev: FinishState, formData: FormData): Promise<FinishState> {
  const next = safeNextPath(String(formData.get("next") ?? ""), "/studio");
  const s = await setup();
  if (!s) return { error: OFF };
  const kind: CredentialKind = formData.get("kind") === "create" ? "create" : "request";
  const factorId = String(formData.get("factorId") ?? "");
  const challengeId = String(formData.get("challengeId") ?? "");
  const credential = parseCredentialJson(formData.get("credential"), kind);
  if (!factorId || !challengeId || !credential) return { error: "The passkey did not answer. Try again." };

  // The factor must be the caller's own: Supabase checks too, this keeps the error plain.
  const { data: factors } = await s.supabase.auth.mfa.listFactors();
  if (!factors?.all.some((f) => f.id === factorId && f.factor_type === "webauthn")) return { error: "No passkey found. Reload the page and start again." };

  // supabase-js serialises a browser credential with toJSON; this one is already JSON.
  const asCredential = { toJSON: () => credential };
  const { error } =
    kind === "create"
      ? await s.supabase.auth.mfa.verify({
          factorId,
          challengeId,
          webauthn: { ...s.rp, type: "create", credential_response: asCredential as never },
        })
      : await s.supabase.auth.mfa.verify({
          factorId,
          challengeId,
          webauthn: { ...s.rp, type: "request", credential_response: asCredential as never },
        });
  if (error) {
    console.error("passkey_verify_failed", error.code ?? "");
    return { error: "That passkey did not work. Try again, or use your authenticator app." };
  }
  redirect(next);
}
