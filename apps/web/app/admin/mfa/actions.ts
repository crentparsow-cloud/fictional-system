"use server";

import { notFound, redirect } from "next/navigation";
import { cleanTotpCode } from "@/lib/staff-access";
import { getStaffAccess } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Second factor for staff (F-080). TOTP through Supabase Auth MFA.
 *
 * The session cookie is HttpOnly, so every MFA call runs here on the server
 * with the user client. challengeAndVerify upgrades the session to aal2 and
 * the new tokens are written back to the cookie by the action.
 *
 * Each action checks the staff gate again: only a signed-in staff account
 * still at aal1 may enrol or verify through this page.
 */

export type EnrolState =
  | { status: "idle" }
  | { status: "enrolled"; factorId: string; qr: string; secret: string }
  | { status: "error"; message: string };

export type VerifyState = { error: string | null };

async function requireStaffAtAal1(): Promise<void> {
  const { decision } = await getStaffAccess();
  if (decision === "signin") redirect("/sign-in?next=/admin/mfa");
  if (decision === "notfound") notFound();
  if (decision === "ok") redirect("/admin");
}

export async function startEnrolment(): Promise<EnrolState> {
  await requireStaffAtAal1();
  const supabase = await createUserClient();

  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { status: "error", message: "Could not read your sign-in factors. Try again." };
  if (factors.totp.length > 0) return { status: "error", message: "An authenticator is already set up. Reload the page to enter a code." };

  // Clear half-finished enrolments so a fresh one can start.
  for (const f of factors.all) {
    if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Akana admin" });
  if (error || !data) {
    console.error("mfa_enrol_failed", error?.code ?? "");
    return { status: "error", message: "Could not start set-up. Check that TOTP is enabled in Supabase Auth, then try again." };
  }
  return { status: "enrolled", factorId: data.id, qr: qrDataUri(data.totp.qr_code), secret: data.totp.secret };
}

export async function verifyCode(_prev: VerifyState, formData: FormData): Promise<VerifyState> {
  await requireStaffAtAal1();
  const code = cleanTotpCode(formData.get("code"));
  if (!code) return { error: "Enter the six-digit code from your authenticator app." };

  const supabase = await createUserClient();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { error: "Could not read your sign-in factors. Try again." };

  // A verified factor wins. Otherwise the factor being enrolled, which must be the caller's own.
  const asked = String(formData.get("factorId") ?? "");
  const verified = factors.totp[0];
  const pending = factors.all.find((f) => f.id === asked && f.factor_type === "totp" && f.status === "unverified");
  const factorId = verified?.id ?? pending?.id;
  if (!factorId) return { error: "No authenticator found. Reload the page and start again." };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: "That code did not work. Wait for a new code and try again." };
  redirect("/admin");
}

/** Supabase returns the QR code as SVG, sometimes already as a data URI. Always hand back an encoded data URI. */
function qrDataUri(qr: string): string {
  const svg = qr.replace(/^data:image\/svg\+xml;(utf-8|utf8|charset=utf-8),/i, "");
  if (svg.startsWith("data:")) return svg;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
