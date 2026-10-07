"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth";
import { cleanTotpCode } from "@/lib/staff-access";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Step-up for payees (F-143). TOTP through Supabase Auth MFA, as for staff
 * (app/admin/mfa), but open to any signed-in account. Verifying a fresh
 * challenge moves the totp time in the token forward, which is what
 * app.recent_step_up and lib/payouts/step-up.ts look for. The session cookie
 * is HttpOnly, so every call runs here with the user client.
 */

export type EnrolState =
  | { status: "idle" }
  | { status: "enrolled"; factorId: string; qr: string; secret: string }
  | { status: "error"; message: string };

export type VerifyState = { error: string | null };

async function signedInClient(next: string) {
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/sign-in?next=${encodeURIComponent(`/payouts/verify?next=${encodeURIComponent(next)}`)}`);
  return supabase;
}

export async function startPayeeEnrolment(): Promise<EnrolState> {
  const supabase = await signedInClient("/payouts");
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { status: "error", message: "Could not read your sign-in settings. Try again." };
  if (factors.totp.length > 0) return { status: "error", message: "An authenticator is already set up. Reload the page to enter a code." };
  for (const f of factors.all) {
    if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Akana payouts" });
  if (error || !data) {
    console.error("payee_mfa_enrol_failed", error?.code ?? "");
    return { status: "error", message: "Could not start set-up. Try again in a moment." };
  }
  return { status: "enrolled", factorId: data.id, qr: qrDataUri(data.totp.qr_code), secret: data.totp.secret };
}

export async function verifyPayeeCode(_prev: VerifyState, formData: FormData): Promise<VerifyState> {
  const next = safeNextPath(String(formData.get("next") ?? ""), "/payouts");
  const supabase = await signedInClient(next);
  const code = cleanTotpCode(formData.get("code"));
  if (!code) return { error: "Enter the six-digit code from your authenticator app." };

  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { error: "Could not read your sign-in settings. Try again." };
  const asked = String(formData.get("factorId") ?? "");
  const verified = factors.totp[0];
  const pending = factors.all.find((f) => f.id === asked && f.factor_type === "totp" && f.status === "unverified");
  const factorId = verified?.id ?? pending?.id;
  if (!factorId) return { error: "No authenticator found. Reload the page and start again." };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: "That code did not work. Wait for a new code and try again." };
  redirect(next);
}

function qrDataUri(qr: string): string {
  const svg = qr.replace(/^data:image\/svg\+xml;(utf-8|utf8|charset=utf-8),/i, "");
  if (svg.startsWith("data:")) return svg;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
