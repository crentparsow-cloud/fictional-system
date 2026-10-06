import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getStaffAccess } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { CodeForm, EnrolForm } from "./MfaForms";

export const metadata: Metadata = {
  title: "Staff verification",
  robots: { index: false, follow: false },
};

/**
 * Second factor for staff (F-080). Sits outside the gated admin layout so a
 * staff session at aal1 can reach it. Signed out goes to sign-in, non-staff
 * get a 404, and a session already at aal2 goes straight to /admin.
 */
export default async function AdminMfaPage() {
  const { decision } = await getStaffAccess();
  if (decision === "signin") redirect("/sign-in?next=/admin/mfa");
  if (decision === "notfound") notFound();
  if (decision === "ok") redirect("/admin");

  const supabase = await createUserClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const hasFactor = (data?.totp.length ?? 0) > 0;

  return (
    <main className="auth-page wrap">
      <section className="card auth-card admin-mfa">
        <p className="eyebrow">Akana staff</p>
        <h1>{hasFactor ? "Enter your code" : "Set up a second factor"}</h1>
        {hasFactor ? (
          <>
            <p>Open your authenticator app and enter the current code for Akana admin.</p>
            <CodeForm />
          </>
        ) : (
          <>
            <p>Admin needs an authenticator app on top of your sign-in. You only set this up once.</p>
            <EnrolForm />
          </>
        )}
      </section>
    </main>
  );
}
