"use server";

import { redirect } from "next/navigation";
import type { TotpEnrolState } from "@/components/mfa/TotpForms";
import { generateRecoveryCodes, hashRecoveryCode, normaliseRecoveryCode } from "@/lib/mfa/recovery-codes";
import { READER_SECURITY_PATH } from "@/lib/mfa/reader-mfa";
import { cleanTotpCode } from "@/lib/staff-access";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Optional two-step sign-in for readers (13.2). TOTP through Supabase Auth
 * MFA, as for staff (app/admin/mfa) and payees (app/payouts/verify), opened
 * to any reader who wants it. The session cookie is HttpOnly, so every call
 * runs here with the user client. Recovery codes are made here, shown once
 * by the page, and stored as hashes through the 0037 functions.
 */

export interface ReaderCodeState {
  error: string | null;
  /** Set once the authenticator is confirmed: the recovery codes, shown once. */
  codes?: string[];
  /** The codes could not be stored; two-step sign-in is on without them. */
  codesFailed?: boolean;
}

export interface CodesState {
  error: string | null;
  codes?: string[];
}

async function signedInClient() {
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/sign-in?next=${encodeURIComponent(READER_SECURITY_PATH)}`);
  return supabase;
}

export async function startReaderEnrolment(): Promise<TotpEnrolState> {
  const supabase = await signedInClient();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { status: "error", message: "Could not read your sign-in settings. Try again." };
  if (factors.totp.length > 0) return { status: "error", message: "Two-step sign-in is already on. Reload the page." };
  for (const f of factors.all) {
    if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Akana" });
  if (error || !data) {
    console.error("reader_mfa_enrol_failed", error?.code ?? "");
    return { status: "error", message: "Could not start set-up. Try again in a moment." };
  }
  return { status: "enrolled", factorId: data.id, qr: qrDataUri(data.totp.qr_code), secret: data.totp.secret };
}

/** Confirm the new authenticator with a code. On success the session is at aal2 and recovery codes are issued. */
export async function verifyReaderCode(_prev: ReaderCodeState, formData: FormData): Promise<ReaderCodeState> {
  const supabase = await signedInClient();
  const code = cleanTotpCode(formData.get("code"));
  if (!code) return { error: "Enter the six-digit code from your authenticator app." };

  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { error: "Could not read your sign-in settings. Try again." };
  const asked = String(formData.get("factorId") ?? "");
  const pending = factors.all.find((f) => f.id === asked && f.factor_type === "totp" && f.status === "unverified");
  const factorId = pending?.id ?? factors.totp[0]?.id;
  if (!factorId) return { error: "No authenticator found. Reload the page and start again." };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: "That code did not work. Wait for a new code and try again." };

  const issued = await issueCodes(supabase);
  return issued ? { error: null, codes: issued } : { error: null, codesFailed: true };
}

/** Replace the recovery codes. The database insists on a session that passed the authenticator (AKR04). */
export async function newRecoveryCodes(): Promise<CodesState> {
  const supabase = await signedInClient();
  const issued = await issueCodes(supabase);
  return issued ? { error: null, codes: issued } : { error: "New codes could not be made just now. Try again in a moment." };
}

/** Turn two-step sign-in off: remove every authenticator and the recovery codes. Needs aal2, which the layout guarantees. */
export async function turnOffTwoStep(): Promise<void> {
  const supabase = await signedInClient();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) redirect(`${READER_SECURITY_PATH}?notice=off-failed`);
  for (const f of factors.all) {
    if (f.factor_type === "totp") {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
      if (error) {
        console.error("reader_mfa_unenrol_failed", error.code ?? "");
        redirect(`${READER_SECURITY_PATH}?notice=off-failed`);
      }
    }
  }
  const { error } = await supabase.rpc("mfa_recovery_codes_clear");
  if (error) console.error("reader_mfa_codes_clear_failed", error.code ?? "");
  redirect(`${READER_SECURITY_PATH}?notice=off`);
}

async function issueCodes(supabase: Awaited<ReturnType<typeof createUserClient>>): Promise<string[] | null> {
  const codes = generateRecoveryCodes();
  const hashes = codes.map((c) => hashRecoveryCode(normaliseRecoveryCode(c)!));
  const { error } = await supabase.rpc("mfa_recovery_codes_issue", { p_hashes: hashes });
  if (error) {
    console.error("reader_mfa_codes_issue_failed", error.code ?? "");
    return null;
  }
  return codes;
}

function qrDataUri(qr: string): string {
  const svg = qr.replace(/^data:image\/svg\+xml;(utf-8|utf8|charset=utf-8),/i, "");
  if (svg.startsWith("data:")) return svg;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
