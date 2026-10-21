import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth";
import { getRoleMfaSession, passkeyEnabled } from "@/lib/mfa/role-mfa-server";
import { createUserClient } from "@/lib/supabase/server";
import { PayeeCodeForm, PayeeEnrolForm } from "../payouts/verify/VerifyForms";
import { PasskeyButton } from "./PasskeyForms";
import { RecoveryForm } from "./RecoveryForm";

export const metadata: Metadata = {
  title: "Check it is you",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * Second factor for owners, finance and staff (F-143). Before billing,
 * seats, members, prices or licences change, the session must have passed
 * an authenticator app code (or a passkey, once the mfa_passkey flag is on).
 * The set-up and code forms are the payee ones from /payouts/verify; a code
 * entered here lifts the whole session to aal2 and sends the person back.
 *
 * Readers who turned on two-step sign-in (13.2) land here too, with
 * ?for=reader, reader copy, and a recovery code form when they hold codes.
 */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createUserClient();
  const { data: userData } = await supabase.auth.getUser();
  // With no next, staff go to /admin. The Studio is invite only and shows a
  // 404 to anyone without an organisation, which is where staff landed before.
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : null, sp.for === "reader" ? "/home" : defaultAfterVerify(userData.user?.app_metadata));
  if (!userData.user) redirect(`/sign-in?next=${encodeURIComponent(`/verify?next=${encodeURIComponent(next)}`)}`);
  if ((await getRoleMfaSession()).verified) redirect(next);

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const hasTotp = (factors?.totp.length ?? 0) > 0;
  const hasPasskey = (factors?.webauthn?.length ?? 0) > 0;
  const passkeyOn = hasPasskey && (await passkeyEnabled());
  const forReader = sp.for === "reader";
  const { data: codesLeft } = hasTotp ? await supabase.rpc("mfa_recovery_codes_left") : { data: null };
  const hasRecoveryCodes = typeof codesLeft === "number" && codesLeft > 0;

  if (forReader && hasTotp) {
    return (
      <main className="auth-page wrap">
        <section className="card auth-card admin-mfa">
          <p className="eyebrow">Two-step sign-in</p>
          <h1>Check it is you</h1>
          <p>You turned on two-step sign-in. Enter the current six-digit code from your authenticator app.</p>
          <PayeeCodeForm next={next} />
          {passkeyOn ? <PasskeyButton next={next} mode="check" /> : null}
          {hasRecoveryCodes ? <RecoveryForm /> : null}
          <p className="muted small">You will be asked once per sign-in. You can turn this off any time from the You tab.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page wrap">
      <section className="card auth-card admin-mfa">
        <p className="eyebrow">Account security</p>
        <h1>{hasTotp ? "Check it is you" : "Set up an authenticator"}</h1>
        {hasTotp ? (
          <>
            <p>Changes to billing, seats, members, prices and licences need a code from your authenticator app. Enter the current one to carry on.</p>
            <PayeeCodeForm next={next} />
            {passkeyOn ? <PasskeyButton next={next} mode="check" /> : null}
            {hasRecoveryCodes ? <RecoveryForm /> : null}
          </>
        ) : (
          <>
            <p>
              As an owner or finance contact you can change billing, seats, members, prices and licences. To keep that safe, those changes need an
              authenticator app as well as your sign-in. You set it up once. Any authenticator app works.
            </p>
            <PayeeEnrolForm next={next} />
          </>
        )}
        <p className="muted small">You will be asked again each time you sign in. Reading and reports do not need a code.</p>
        <p className="muted small">Lost your authenticator? Contact Akana support. We check who you are before we reset it.</p>
      </section>
    </main>
  );
}

/** Where /verify sends someone when no next is given: staff to /admin, everyone else to /studio. */
function defaultAfterVerify(appMetadata: Record<string, unknown> | undefined): string {
  const roles = appMetadata?.platform_roles;
  return Array.isArray(roles) && roles.length > 0 ? "/admin" : "/studio";
}
