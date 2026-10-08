import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getRoleMfaSession, passkeyEnabled } from "@/lib/mfa/role-mfa-server";
import { createUserClient } from "@/lib/supabase/server";
import { PasskeyButton } from "../PasskeyForms";

export const metadata: Metadata = {
  title: "Add a passkey",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * Add a passkey as a second way to confirm it is you (F-143). Only while
 * the mfa_passkey flag is on, and only from a session that has just passed
 * the authenticator app, so a passkey is never the only factor.
 */
export default async function AddPasskeyPage() {
  if (!(await passkeyEnabled())) notFound();
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/sign-in?next=${encodeURIComponent("/verify/passkey")}`);
  if (!(await getRoleMfaSession()).verified) redirect(`/verify?next=${encodeURIComponent("/verify/passkey")}`);
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const count = factors?.webauthn?.length ?? 0;

  return (
    <main className="auth-page wrap">
      <section className="card auth-card admin-mfa">
        <p className="eyebrow">Account security</p>
        <h1>Add a passkey</h1>
        <p>A passkey lets you confirm it is you with your face, fingerprint or device PIN instead of typing a code. Keep your authenticator app too.</p>
        {count > 0 ? <p className="muted small">You have {count === 1 ? "one passkey" : `${count} passkeys`} already.</p> : null}
        <PasskeyButton next="/studio" mode="add" />
        <p className="muted small">Lost a device? Contact Akana support to remove its passkey. We check who you are first.</p>
      </section>
    </main>
  );
}
