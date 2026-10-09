import type { Metadata } from "next";
import Link from "next/link";
import { getReaderSession } from "@/lib/auth";
import { securityNoticeText } from "@/lib/mfa/reader-mfa";
import { createUserClient } from "@/lib/supabase/server";
import { NewCodesForm, TurnOffForm, TurnOnForm } from "./SecurityForms";

export const metadata: Metadata = {
  title: "Two-step sign-in",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Optional two-step sign-in for readers (13.2). Off by default and never
 * required. On: the reader gives a code from an authenticator app after each
 * sign-in link, and keeps eight recovery codes for the day the phone is
 * lost. The (reader) layout has already made sure a reader with it on
 * passed the authenticator on this session, so the forms here run at aal2.
 *
 * Owners, finance members and staff manage their second factor through
 * /verify and support (docs/SUPPORT_MFA_RECOVERY.md); this page says so and
 * offers them nothing, so the reader flow cannot weaken theirs.
 */
export default async function SecurityPage({ searchParams }: Props) {
  const params = await searchParams;
  const notice = securityNoticeText(params.notice);
  const session = await getReaderSession();
  const supabase = await createUserClient();

  // role_mfa_status.required: this account's second factor is a role rule, not a choice.
  const { data: statusRow } = await supabase.rpc("role_mfa_status");
  const row = (Array.isArray(statusRow) ? statusRow[0] : statusRow) as { required?: boolean } | undefined;
  const managed = Boolean(row?.required);

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const on = (factors?.totp.length ?? 0) > 0 || Boolean(session?.mfaEnrolled);
  const { data: leftData } = on ? await supabase.rpc("mfa_recovery_codes_left") : { data: null };
  const left = typeof leftData === "number" ? leftData : 0;

  return (
    <section className="tab-page you-page">
      <p className="eyebrow">
        <Link href="/you">You</Link>
      </p>
      <h1>Two-step sign-in</h1>
      <p className="muted">An extra check when you sign in, from an app on your phone. Optional. Your account works the same without it.</p>

      {notice ? (
        <p className="you-notice" role="status">
          {notice}
        </p>
      ) : null}

      {managed ? (
        <section className="you-section" aria-labelledby="sec-managed">
          <h2 id="sec-managed">Set by your role</h2>
          <p>
            Your account changes billing, members or licences for an organisation, or is an Akana staff account, so an authenticator app is already part of your
            sign-in. It is managed from the verify page and by support, not here.
          </p>
          <p>
            <Link href="/verify?next=/you/security">Open the verify page</Link>
          </p>
        </section>
      ) : on ? (
        <>
          <section className="you-section" aria-labelledby="sec-status">
            <h2 id="sec-status">On</h2>
            <p>After each sign-in link you enter the current six-digit code from your authenticator app.</p>
          </section>
          <section className="you-section" aria-labelledby="sec-codes">
            <h2 id="sec-codes">Recovery codes</h2>
            <p>If you lose your phone, one recovery code signs you in and turns two-step sign-in off, so you can set it up again.</p>
            <NewCodesForm left={left} />
          </section>
          <section className="you-section" aria-labelledby="sec-off">
            <h2 id="sec-off">Turn off</h2>
            <TurnOffForm />
          </section>
        </>
      ) : (
        <>
          <section className="you-section" aria-labelledby="sec-how">
            <h2 id="sec-how">How it works</h2>
            <p>
              You scan a code once with any authenticator app (Google Authenticator, Microsoft Authenticator, 1Password and others). After that, each sign-in link
              also asks for the six-digit code the app shows. You get eight recovery codes to keep somewhere safe in case you lose the phone.
            </p>
            <TurnOnForm />
          </section>
        </>
      )}
    </section>
  );
}
